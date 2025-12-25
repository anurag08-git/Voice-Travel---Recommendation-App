
import React from 'react';
import { TravelPlan } from '../types';

interface PlanningViewProps {
  plan: TravelPlan;
  onBack: () => void;
  onBook: () => void;
}

const PlanningView: React.FC<PlanningViewProps> = ({ plan, onBack, onBook }) => {
  return (
    <div className="min-h-screen bg-[#fcfaf7] pt-24 pb-32 px-6 max-w-4xl mx-auto">
      <button 
        onClick={onBack}
        className="mb-8 text-orange-600 font-bold flex items-center gap-2 text-xl"
      >
        ← Back to exploration
      </button>

      <h1 className="text-5xl font-bold mb-2">{plan.destination}</h1>
      <p className="text-2xl text-stone-500 mb-12 italic">Your curated experience journey</p>

      <div className="space-y-12 mb-16">
        {plan.days.map((day) => (
          <div key={day.day} className="relative pl-12 border-l-2 border-orange-200">
            <div className="absolute left-[-11px] top-0 w-5 h-5 bg-orange-500 rounded-full shadow-lg"></div>
            <h3 className="text-2xl font-bold mb-2">Day {day.day}: {day.title}</h3>
            <p className="text-xl text-stone-700 leading-relaxed">{day.description}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
          <h4 className="text-orange-500 font-bold uppercase tracking-widest text-sm mb-4">Where to stay</h4>
          <p className="text-xl text-stone-800">{plan.stayArea}</p>
        </div>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
          <h4 className="text-orange-500 font-bold uppercase tracking-widest text-sm mb-4">Investment</h4>
          <p className="text-xl text-stone-800">{plan.costEstimate}</p>
        </div>
      </div>

      <div className="bg-orange-50 p-8 rounded-3xl mb-16">
        <h4 className="text-orange-800 font-bold mb-4 text-2xl">Travel Comfort & Ease</h4>
        <div className="space-y-4">
          <p className="text-lg text-orange-900 leading-relaxed">✨ {plan.comfortTips}</p>
          {plan.seniorGuidance && (
             <p className="text-lg text-orange-900 leading-relaxed">👵 <strong>For Seniors:</strong> {plan.seniorGuidance}</p>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-stone-200 flex justify-center gap-4">
        <button 
          onClick={onBook}
          className="bg-orange-600 text-white px-12 py-5 rounded-full text-2xl font-bold shadow-2xl hover:bg-orange-700 transition w-full max-w-md"
        >
          Let's Book This
        </button>
      </div>
    </div>
  );
};

export default PlanningView;
