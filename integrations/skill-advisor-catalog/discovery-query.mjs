// Bilingual retrieval vocabulary, never a package choice or a replacement user task.
const audience = /(?:аудитори\p{L}*|подписчик\p{L}*|клиент\p{L}*|пользовател\p{L}*|люд\p{L}*|audience|subscribers?|customers?|users?)/iu;
const uncertainty = /(?:не\s+(?:зна\p{L}*|понима\p{L}*)|непонятно|выясни\p{L}*|потребност\p{L}*|нужд\p{L}*|готов\p{L}*\s+платить|not\s+sure|(?:don['’]t|do\s+not)\s+know|(?:understand|research|discover)\s+(?:their\s+|user\s+|customer\s+)?needs|pain\s+points?)/iu;
const offer = /(?:предлож\p{L}*|продукт\p{L}*|проблем\p{L}*|потребност\p{L}*|нуж\p{L}*|платить|offer|product|needs?|pain\s+points?)/iu;

export function discoveryQuery(query) {
  if (!audience.test(query) || !uncertainty.test(query) || !offer.test(query)) return null;
  return 'исследование потребностей пользователей проблемы аудитории гипотезы продукта product discovery user needs customer interviews interview guide';
}
