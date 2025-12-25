
import React from 'react';
import { TravelExperience } from '../types';

interface ExperienceReelProps {
  experience: TravelExperience;
  onNext: () => void;
  onPlan: () => void;
}

const ExperienceReel: React.FC<ExperienceReelProps> = ({ experience, onNext, onPlan }) => {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white flex flex-col justify-end">
      {/* Background Image/Video */}
      <img 
        src={experience.imageUrl || `https://picsum.photos/seed/${experience.destination}/1080/1920`} 
        alt={experience.destination}
        className="absolute inset-0 w-full h-full object-cover opacity-70 transition-opacity duration-1000"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>

      {/* Content Overlay */}
      <div className="relative z-10 p-8 pb-32 max-w-2xl mx-auto w-full">
        <h2 className="text-6xl font-bold mb-4 tracking-tight leading-tight text-white drop-shadow-lg">
          {experience.destination}
        </h2>
        
        <div className="space-y-6">
          <p className="text-2xl font-light leading-relaxed italic text-white/90 drop-shadow-md">
            "{experience.narrative}"
          </p>

          <div className="flex flex-wrap gap-3">
             <span className="bg-white/20 border border-white/20 px-4 py-1 rounded-full text-sm font-semibold uppercase tracking-widest backdrop-blur-md">
              {experience.mood}
            </span>
             <span className="bg-white/20 border border-white/20 px-4 py-1 rounded-full text-sm font-semibold uppercase tracking-widest backdrop-blur-md">
              {experience.priceLevel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-5 rounded-2xl bg-black/40 border-white/10">
              <h4 className="text-lg font-bold mb-1 text-orange-300 uppercase tracking-widest text-xs">The Vibe</h4>
              <p className="text-md text-gray-100">{experience.emotionalHook}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl bg-black/40 border-white/10">
              <h4 className="text-lg font-bold mb-1 text-blue-300 uppercase tracking-widest text-xs">The Flavor</h4>
              <p className="text-md text-gray-100">{experience.foodCulture}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {experience.activities.slice(0, 3).map((act, i) => (
              <span key={i} className="text-sm border border-white/40 bg-black/20 px-3 py-1 rounded-lg backdrop-blur-sm">
                ✨ {act}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 left-0 right-0 px-8 flex justify-between items-center z-20">
        <div className="flex flex-col items-center">
            <button 
              onClick={onNext}
              className="bg-white/10 backdrop-blur-md border border-white/30 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/20 transition shadow-xl"
            >
              Show Different
            </button>
            <span className="text-xs text-white/60 mt-2 uppercase tracking-wide">Or say "Next"</span>
        </div>
        
        <div className="flex flex-col items-center">
            <button 
              onClick={onPlan}
              className="bg-orange-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-orange-700 transition shadow-xl flex items-center gap-2"
            >
              Plan This <span>→</span>
            </button>
            <span className="text-xs text-white/60 mt-2 uppercase tracking-wide">Or say "Book this"</span>
        </div>
      </div>

      {/* Suitability Indicators */}
      <div className="absolute top-10 right-8 flex flex-col gap-2 z-20">
        {experience.suitability.seniorFriendly && (
          <div className="bg-green-600/90 px-3 py-1 rounded-lg text-xs font-bold uppercase backdrop-blur-md shadow-lg border border-green-400/30">Senior Friendly</div>
        )}
        {experience.suitability.familyFriendly && (
          <div className="bg-blue-600/90 px-3 py-1 rounded-lg text-xs font-bold uppercase backdrop-blur-md shadow-lg border border-blue-400/30">Family Ready</div>
        )}
      </div>
    </div>
  );
};

export default ExperienceReel;
