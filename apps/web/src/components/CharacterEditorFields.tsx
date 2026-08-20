import type { CharacterDefinition } from '@music-video/shared';

export function CharacterEditorFields({
  character,
  onChange,
}: {
  character: CharacterDefinition;
  onChange: (next: CharacterDefinition) => void;
}) {
  return (
    <>
      <div className="field">
        <label>Name</label>
        <input value={character.name} onChange={(e) => onChange({ ...character, name: e.target.value })} />
      </div>
      <div className="field">
        <label>Face</label>
        <textarea
          style={{ minHeight: 70 }}
          value={character.face}
          onChange={(e) =>
            onChange({
              ...character,
              face: e.target.value,
              promptDescription: e.target.value,
            })
          }
        />
      </div>
      <div className="field">
        <label>Body</label>
        <input value={character.bodyType} onChange={(e) => onChange({ ...character, bodyType: e.target.value })} />
      </div>
      <div className="field">
        <label>Hair</label>
        <input value={character.hair} onChange={(e) => onChange({ ...character, hair: e.target.value })} />
      </div>
      <div className="field">
        <label>Clothes</label>
        <input value={character.clothing} onChange={(e) => onChange({ ...character, clothing: e.target.value })} />
      </div>
      <div className="field">
        <label>Personality</label>
        <input
          value={character.personality}
          onChange={(e) => onChange({ ...character, personality: e.target.value })}
        />
      </div>
    </>
  );
}
