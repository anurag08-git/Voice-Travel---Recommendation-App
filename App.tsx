
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { AppState, TravelExperience, TravelPlan } from './types';
import ExperienceReel from './components/ExperienceReel';
import PlanningView from './components/PlanningView';
import { decode, encode, decodeAudioData, createBlob } from './services/audioUtils';

const API_KEY = process.env.API_KEY || '';

const TRAVEL_EXPERIENCE_FUNCTION: FunctionDeclaration = {
  name: 'showExperience',
  parameters: {
    type: Type.OBJECT,
    description: 'Generates and displays a travel experience card. Call this IMMEDIATELY after understanding the user\'s companion (family/solo/couple).',
    properties: {
      destination: { type: Type.STRING, description: 'Name of the city/region (e.g. Munnar, Hampi, Kyoto)' },
      narrative: { type: Type.STRING, description: '2 sentences describing the vibe and feeling.' },
      emotionalHook: { type: Type.STRING, description: 'Why the soul needs this place.' },
      foodCulture: { type: Type.STRING, description: 'Specific local dish recommendations.' },
      activities: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3 specific activities.' },
      mood: { type: Type.STRING, description: 'E.g. Spiritual, Rustic, High-Energy.' },
      priceLevel: { type: Type.STRING, enum: ['Budget', 'Moderate', 'Premium'] },
      seniorFriendly: { type: Type.BOOLEAN },
      familyFriendly: { type: Type.BOOLEAN },
      visualPrompt: { type: Type.STRING, description: 'Photorealistic prompt for background image.' },
    },
    required: ['destination', 'narrative', 'emotionalHook', 'foodCulture', 'activities', 'mood', 'priceLevel'],
  },
};

const TRAVEL_PLAN_FUNCTION: FunctionDeclaration = {
  name: 'generatePlan',
  parameters: {
    type: Type.OBJECT,
    description: 'Generates a day-by-day itinerary when the user confirms they like the current destination.',
    properties: {
      destination: { type: Type.STRING },
      days: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.NUMBER },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          }
        }
      },
      stayArea: { type: Type.STRING },
      costEstimate: { type: Type.STRING },
      comfortTips: { type: Type.STRING },
      seniorGuidance: { type: Type.STRING },
    },
    required: ['destination', 'days', 'stayArea', 'costEstimate', 'comfortTips'],
  }
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.WELCOME);
  const [experiences, setExperiences] = useState<TravelExperience[]>([]);
  const [currentExpIndex, setCurrentExpIndex] = useState(0);
  const [currentPlan, setCurrentPlan] = useState<TravelPlan | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanupAudio = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
  };

  const startSession = async () => {
    if (isSessionActive) return;
    
    setIsSessionActive(true);
    setAppState(AppState.DISCOVERY);

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // Ensure context is running
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: async () => {
            console.log('Session Opened');
            setIsListening(true);
            
            // Kickstart: Send a brief silence to initialize the audio stream and prompt the model to speak
            // Sending text/plain via sendRealtimeInput is NOT supported and causes "Invalid Argument" errors.
            sessionPromiseRef.current?.then(session => {
                const silence = new Float32Array(1600); // 0.1s silence
                session.sendRealtimeInput({ media: createBlob(silence) });
            });

            // Audio Input Setup
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            // Keep reference to prevent GC
            scriptProcessorRef.current = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromiseRef.current?.then(session => {
                    session.sendRealtimeInput({ media: pcmBlob });
                });
            };

            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current!.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
            // Handle Transcription
            if (message.serverContent?.outputTranscription) {
                setTranscription(prev => prev + message.serverContent?.outputTranscription?.text);
            } else if (message.serverContent?.inputTranscription) {
                setTranscription(prev => prev + message.serverContent?.inputTranscription?.text);
            }
            
            if (message.serverContent?.turnComplete) {
                setTranscription('');
            }

            // Handle Audio Playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
                const outCtx = outputAudioContextRef.current!;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
                const source = outCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outCtx.destination);
                source.addEventListener('ended', () => sourcesRef.current.delete(source));
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }

            // Handle Tool Calls
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'showExperience') {
                    const args = fc.args as any;
                    const newExp: TravelExperience = {
                    id: Date.now().toString(),
                    destination: args.destination,
                    narrative: args.narrative,
                    emotionalHook: args.emotionalHook,
                    foodCulture: args.foodCulture,
                    activities: args.activities,
                    mood: args.mood,
                    priceLevel: args.priceLevel as any,
                    suitability: {
                        seniorFriendly: args.seniorFriendly || false,
                        familyFriendly: args.familyFriendly || false,
                        youthOriented: args.youthOriented || false,
                    },
                    visualPrompt: args.visualPrompt,
                    imageUrl: `https://picsum.photos/seed/${args.destination}/1080/1920`
                    };
                    
                    setExperiences(prev => {
                        const updated = [...prev, newExp];
                        setCurrentExpIndex(updated.length - 1);
                        return updated;
                    });
                    setAppState(AppState.DISCOVERY);
                    
                    sessionPromiseRef.current?.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Displaying " + args.destination + " to user." } }
                    }));
                } else if (fc.name === 'generatePlan') {
                    setCurrentPlan(fc.args as any);
                    setAppState(AppState.PLANNING);
                    sessionPromiseRef.current?.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Plan generated and displayed." } }
                    }));
                }
                }
            }
            },
            onerror: (e) => {
                console.error('Gemini Live Error', e);
                setIsListening(false);
            },
            onclose: () => {
                setIsSessionActive(false);
                setIsListening(false);
                cleanupAudio();
            },
        },
        config: {
            responseModalities: [Modality.AUDIO],
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            tools: [{ functionDeclarations: [TRAVEL_EXPERIENCE_FUNCTION, TRAVEL_PLAN_FUNCTION] }],
            systemInstruction: { parts: [{ text: `
            You are VibeTravel's Indian Heritage Guide. 
            
            MANDATORY INSTRUCTIONS:
            1. **GREETING**: You MUST start the conversation immediately with "Namaste! Welcome to VibeTravel." 
            2. **LANGUAGE ADAPTATION**: Listen to the user. If they sound like they are from South India or use Indian English, adapt your accent and style to be familiar, warm, and respectful (use terms like 'Sir/Madam', be polite). 
            3. **OBJECTIVE**: Your goal is to visualize a trip for them. 
            4. **FLOW**:
                - Greeting: "Namaste! Are you planning a trip for yourself, or with family?"
                - Context: Listen to their answer. 
                - ACTION: As soon as you have a vague idea (e.g., "Family trip", "Relaxing"), IMMEDIATELY call the 'showExperience' tool. Do not ask many questions. Propose a destination (like Ooty, Munnar, Coorg if South context) and show it.
            
            Be charming, evocative, and culturally intelligent.
            ` }] }
        }
        });
    } catch (err) {
        console.error("Failed to start session:", err);
        setIsSessionActive(false);
        setIsListening(false);
        alert("Could not access microphone. Please allow permissions.");
    }
  };

  const handleNextExperience = () => {
    // We cannot easily send text commands in the Live API without 'turns' support which is complex to construct manually here.
    // We rely on the user to speak.
    alert("Please say 'Show me something else' or 'Next'!");
  };

  const handleConfirmInterest = () => {
    // We rely on the user to speak.
    alert("Please say 'I love this' or 'Plan this'!");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  return (
    <div className="min-h-screen relative font-sans overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 bg-[#fcfaf7] -z-10"></div>

      {appState === AppState.WELCOME && (
        <div className="h-screen flex flex-col items-center justify-center p-8 text-center bg-white">
          <div className="mb-12">
            <h1 className="text-7xl font-bold text-orange-600 mb-4 tracking-tight">VibeTravel</h1>
            <p className="text-3xl text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
              Don't just book a trip. <br/> Feel the journey.
            </p>
          </div>
          <button 
            onClick={startSession}
            className="group relative bg-orange-500 text-white px-16 py-8 rounded-full text-3xl font-bold shadow-2xl hover:scale-105 transition-all duration-300 active:scale-95"
          >
            <span className="relative z-10">Say Namaste</span>
            <div className="absolute inset-0 bg-orange-400 rounded-full blur-xl group-hover:blur-2xl transition-all opacity-40"></div>
          </button>
          <p className="mt-12 text-stone-400 text-xl font-medium flex items-center gap-3">
             <span className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></span>
             {isListening ? 'Microphone Active' : 'Microphone Ready'}
          </p>
        </div>
      )}

      {appState === AppState.DISCOVERY && experiences.length > 0 && (
        <ExperienceReel 
          experience={experiences[currentExpIndex]} 
          onNext={handleNextExperience}
          onPlan={handleConfirmInterest}
        />
      )}

      {appState === AppState.DISCOVERY && experiences.length === 0 && (
        <div className="h-screen flex flex-col items-center justify-center bg-white p-8">
           <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-orange-500 mb-8"></div>
           <p className="text-4xl font-bold text-stone-800 animate-pulse">Connecting to your guide...</p>
           <p className="mt-4 text-2xl text-stone-500">Listening for "Namaste"...</p>
           {isListening && <div className="mt-4 text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full">Mic On</div>}
        </div>
      )}

      {appState === AppState.PLANNING && currentPlan && (
        <PlanningView 
          plan={currentPlan} 
          onBack={() => setAppState(AppState.DISCOVERY)}
          onBook={() => alert("Connecting you with our travel concierge...")}
        />
      )}

      {/* Persistent Voice Feedback */}
      {isSessionActive && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
          <div className="glass-card bg-white/60 backdrop-blur-xl border border-white/40 p-6 rounded-full shadow-2xl flex items-center gap-6">
            <div className="relative">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors duration-300 ${isListening ? 'bg-orange-500 animate-bounce' : 'bg-gray-400'}`}>
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className={`absolute -inset-1 rounded-full ${isListening ? 'bg-orange-500/20 animate-ping' : ''}`}></div>
            </div>
            <div className="flex-1 overflow-hidden">
               <p className="text-xl font-bold text-stone-800 truncate">
                {transcription || (isListening ? "I'm listening..." : "Connecting...")}
               </p>
               <p className="text-sm text-stone-500 font-semibold uppercase tracking-widest">VibeTravel Live</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
