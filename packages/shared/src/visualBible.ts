export interface ColorDefinition {
  name: string;
  hex: string;
  usage: string;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  role: string;
  ageAppearance?: string;
  bodyType: string;
  face: string;
  hair: string;
  clothing: string;
  colors: string[];
  personality: string;
  expressions: string[];
  importantContinuityFeatures: string[];
  promptDescription: string;
  referenceAssetId?: string;
  referenceUrl?: string;
  lockedReferenceImage: boolean;
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  description: string;
  layout: string;
  materials: string[];
  importantObjects: string[];
  lighting: string;
  colors: string[];
  continuityFeatures: string[];
  promptDescription: string;
}

export interface PropDefinition {
  id: string;
  name: string;
  description: string;
  promptDescription: string;
}

export interface VisualBible {
  projectTitle: string;
  overallStyle: {
    visualMedium: string;
    mood: string;
    renderingStyle: string;
    cameraLanguage: string;
    animationLanguage: string;
  };
  characters: CharacterDefinition[];
  environments: EnvironmentDefinition[];
  colorPalette: ColorDefinition[];
  recurringProps: PropDefinition[];
  continuityRules: string[];
  negativeRules: string[];
  masterPrompt: string;
}
