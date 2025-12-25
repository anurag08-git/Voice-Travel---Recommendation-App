
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
    description: 'Generates and shows a new travel experience card based on the user mood or request.',
    properties: {
      destination: { type: Type.STRING, description: 'Name of the city/region' },
      narrative: { type: Type.STRING, description: 'A short immersive 2-sentence description of the vibe' },
      emotionalHook: { type: Type.STRING, description: 'Why this user would love it right now' },
      foodCulture: { type: Type.STRING, description: 'Brief mention of cuisine and age-friendliness' },
      activities: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Top 3-4 things to do' },
      mood: { type: Type.STRING, description: 'One word mood: e.g. Spiritual, Vibrant, Chill' },
      priceLevel: { type: Type.STRING, enum: ['Budget', 'Moderate', 'Premium'] },
      seniorFriendly: { type: Type.BOOLEAN },
      familyFriendly: { type: Type.BOOLEAN },
      youthOriented: { type: Type.BOOLEAN },
      visualPrompt: { type: Type.STRING, description: 'A prompt for generating an image of this place' },
    },
    required: ['destination', 'narrative', 'emotionalHook', 'foodCulture', 'activities', 'mood', 'priceLevel'],
  },
};

const TRAVEL_PLAN_FUNCTION: FunctionDeclaration = {
  name: 'generatePlan',
  parameters: {
    type: Type.OBJECT,
    description: 'Generates a detailed travel plan for a chosen destination.',
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

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const startSession = async () => {
    if (isSessionActive) return;
    
    setIsSessionActive(true);
    setAppState(AppState.DISCOVERY);

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    sessionPromiseRef.current = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          console.log('Session Opened');
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromiseRef.current?.then(session => {
              session.sendRealtimeInput({ media: pcmBlob });
            });
          };

          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
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
                setExperiences(prev => [...prev, newExp]);
                setCurrentExpIndex(prev => prev === -1 ? 0 : experiences.length);
                setAppState(AppState.DISCOVERY);
                
                sessionPromiseRef.current?.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: "Showing " + args.destination } }
                }));
              } else if (fc.name === 'generatePlan') {
                setCurrentPlan(fc.args as any);
                setAppState(AppState.PLANNING);
                sessionPromiseRef.current?.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: "Plan generated." } }
                }));
              }
            }
          }
        },
        onerror: (e) => console.error('Gemini Live Error', e),
        onclose: () => setIsSessionActive(false),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        tools: [{ functionDeclarations: [TRAVEL_EXPERIENCE_FUNCTION, TRAVEL_PLAN_FUNCTION] }],
        systemInstruction: `
          You are VibeTravel's Experience Architect. 
          Your mission is to help people FEEL travel. 
          Be warm, slow-spoken, and senior-friendly.
          
          PHASE 1 (Onboarding): Ask ONE question: "Tell me — are you planning a trip for yourself, or with someone else?"
          PHASE 2 (Context): Gradually infer traveler type, budget, and mood. No forms.
          PHASE 3 (Discovery): Proactively call 'showExperience' to show visual reels. Use descriptive language.
          PHASE 4 (Planning): If they say "I want this" or "Tell me more about Hampi", call 'generatePlan'.
          
          Always speak in simple language. If they want something different (e.g. "cheaper", "calmer"), call 'showExperience' again with new parameters.
        `
      }
    });
  };

  const handleNextExperience = () => {
    // We send a voice signal or text hint to Gemini to give something else
    sessionPromiseRef.current?.then(session => {
       session.sendRealtimeInput({ media: { data: encode(new TextEncoder().encode("Show me something else")), mimeType: 'text/plain' } as any });
    });
    // For manual fallback if AI is slow
    if (currentExpIndex < experiences.length - 1) {
      setCurrentExpIndex(prev => prev + 1);
    }
  };

  const handleConfirmInterest = () => {
     sessionPromiseRef.current?.then(session => {
       session.sendRealtimeInput({ media: { data: encode(new TextEncoder().encode("I love this place, show me a plan")), mimeType: 'text/plain' } as any });
    });
  };

  return (
    <div className="min-h-screen relative font-sans overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 bg-[#fcfaf7] -z-10"></div>

      {appState === AppState.WELCOME && (
        <div className="h-screen flex flex-col items-center justify-center p-8 text-center bg-white">
          <div className="mb-12">
            <h1 className="text-7xl font-bold text-orange-600 mb-4 tracking-tight">VibeTravel</h1>
            <p className="text-3xl text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
              Don't just book a trip. <br/> Feel the journey before you go.
            </p>
          </div>
          <button 
            onClick={startSession}
            className="group relative bg-orange-500 text-white px-16 py-8 rounded-full text-3xl font-bold shadow-2xl hover:scale-105 transition-all duration-300 active:scale-95"
          >
            <span className="relative z-10">Begin Your Journey</span>
            <div className="absolute inset-0 bg-orange-400 rounded-full blur-xl group-hover:blur-2xl transition-all opacity-40"></div>
          </button>
          <p className="mt-12 text-stone-400 text-xl font-medium flex items-center gap-3">
             <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
             Voice-first experience
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
           <p className="text-4xl font-bold text-stone-800 animate-pulse">Finding a vibe for you...</p>
           <p className="mt-4 text-2xl text-stone-500">I'm listening. Tell me who you're traveling with.</p>
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
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center animate-bounce shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="absolute -inset-1 bg-orange-500/20 rounded-full animate-ping"></div>
            </div>
            <div className="flex-1 overflow-hidden">
               <p className="text-xl font-bold text-stone-800 truncate">
                {transcription || "I'm listening..."}
               </p>
               <p className="text-sm text-stone-500 font-semibold uppercase tracking-widest">VibeTravel AI Active</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
