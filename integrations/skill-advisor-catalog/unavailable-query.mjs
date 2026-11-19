// Only supplies an explanation for an already unsupported request. Never selects a package.
const clarificationMarker='\nПоследнее уточнение (при противоречии считать актуальным): ';
const serviceRequest=/(?:нужен\s+(?:мастер|сантехник|электрик|курьер)(?![\p{L}-])|(?:вызови|пришли|закажи)\s+(?:мастер\p{L}*|сантехник\p{L}*|электрик\p{L}*|курьер\p{L}*)(?![\p{L}-])|(?:send|book|hire)\s+(?:a\s+)?(?:plumber|electrician|courier|technician)\b)/iu;
const onSite=/(?:приед\p{L}*|приеха\p{L}*|ко\s+мне|на\s+дом|почин\p{L}*|достав\p{L}*|at\s+my\s+(?:home|house)|come\s+to|repair|deliver)/iu;
const chance=/(?:лотере\p{L}*|тираж\p{L}*|случайн\p{L}*|броск\p{L}*\s+(?:кост\p{L}*|монет\p{L}*)|lottery|random\s+(?:draw|outcome)|coin\s+toss|dice\s+roll)/iu;
const guarantee=/(?:наверняка|гарант\p{L}*|точн\p{L}*\s+(?:выигрыш\p{L}*|числ\p{L}*|результат\p{L}*)|guarantee\p{L}*|certain\p{L}*|winning\s+numbers)/iu;
const future=/(?:следующ\p{L}*|будущ\p{L}*|предскаж\p{L}*|наверняка|predict\p{L}*|future|next|guaranteed?\s+(?:winning|win))/iu;
const historical=/(?:прошл\p{L}*|предыдущ\p{L}*|состоявш\p{L}*|past|previous|last\s+(?:week|draw|month|year))/iu;
const advice=/^(?:как(?=\s|$)|почему(?=\s|$)|объясни|расскажи|научи|исследуй|составь|напиши|создай|разработай|how\b|why\b|explain\b|write\b|design\b|build\b|research\b)/iu;
const negatedService=/(?:не\s+(?:нужен|вызывай|присылай|заказывай)|(?:do\s+not|don['’]t)\s+(?:send|book|hire))/iu;

export function unavailableQueryReason(query) {
 const current=query.split(clarificationMarker).at(-1).trim();
 if (advice.test(current) || negatedService.test(current) || /не\s+(?:обещай|гарантируй)/iu.test(current)) return null;
 if (serviceRequest.test(current) && onSite.test(current)) return 'physical-service';
 if (chance.test(current) && guarantee.test(current) && future.test(current) && !historical.test(current)) return 'chance-guarantee';
 return null;
}

export const unavailableMessages=Object.freeze({
 'physical-service':'Выезд и физическую работу выполняет специалист на месте. Для такой задачи обратитесь в местную профильную службу. Пакеты каталога помогают с программными задачами.',
 'chance-guarantee':'Гарантированно предсказать результат будущего случайного розыгрыша невозможно. В каталоге нет навыка, который мог бы обеспечить такой выигрыш.',
});
