
export interface TravelExperience {
  id: string;
  destination: string;
  narrative: string;
  emotionalHook: string;
  foodCulture: string;
  activities: string[];
  suitability: {
    seniorFriendly: boolean;
    familyFriendly: boolean;
    youthOriented: boolean;
  };
  visualPrompt: string;
  imageUrl?: string;
  mood: string;
  priceLevel: 'Budget' | 'Moderate' | 'Premium';
}

export interface TravelPlan {
  destination: string;
  days: {
    day: number;
    title: string;
    description: string;
  }[];
  stayArea: string;
  costEstimate: string;
  comfortTips: string;
  seniorGuidance?: string;
}

export enum AppState {
  WELCOME = 'WELCOME',
  DISCOVERY = 'DISCOVERY',
  PLANNING = 'PLANNING',
  BOOKING = 'BOOKING'
}
