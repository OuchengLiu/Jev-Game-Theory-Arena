// TypeSafe Choice limit: https://docs.typesafe.ai/primitives/choice
export const MAX_CHOICE_OPTIONS = 255;
export function validateChoiceLimits(questions) {
  for (const [id,q] of Object.entries(questions)) {
    if(q.type==='choice' && Object.keys(q.criteria).length>MAX_CHOICE_OPTIONS) {
      throw new Error(`Question ${id} exceeds Jev's ${MAX_CHOICE_OPTIONS}-option Choice limit`);
    }
  }
}
