/** 短、唯一、唔靚都冇所謂 —— 冇後端，唔會撞到第二部機。 */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
