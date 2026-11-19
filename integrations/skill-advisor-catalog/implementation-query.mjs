// Retrieval vocabulary describes requested capabilities, never a chosen package.
const createVerbs='сдела\\p{L}*|созда\\p{L}*|разработ\\p{L}*|собра\\p{L}*|написа\\p{L}*|напиши|закод\\p{L}*|реализ\\p{L}*|build|create|implement|develop|code';
const create=new RegExp(`(?:${createVerbs})(?![\\p{L}\\p{N}_-])`,'iu');
const negatedCreate=new RegExp(`(?:не\\s+|do\\s+not\\s+|don['’]t\\s+|never\\s+)(?:${createVerbs}|дела\\p{L}*|разрабатыва\\p{L}*)(?!\\p{L})`,'iu');
const auxiliaryOutput=new RegExp(`(?:${createVerbs})\\s+(?:\\p{L}+\\s+)?(?:тест\\p{L}*|бэкап\\p{L}*|резервн\\p{L}*|backup|tests?)(?!\\p{L})`,'iu');
const web=/(?:сайт\p{L}*|страниц\p{L}*|веб[ -]?\p{L}*|браузер\p{L}*|интерфейс\p{L}*|фронтенд\p{L}*|website|web\s+app|browser|front[ -]?end)/iu;
const backend=/(?:б[эе]кенд\p{L}*|серверн\p{L}*\s+(?:част\p{L}*|логик\p{L}*)|фул[ -]?ст[еэ]к\p{L}*|back[ -]?end|server[ -]?side|full[ -]?stack|\bAPI\b)/iu;
const marker='\nПоследнее уточнение (при противоречии считать актуальным): ';
const frontendOnly=/(?:только\s+(?:фронтенд\p{L}*|интерфейс\p{L}*)|(?:only|just)\s+(?:the\s+)?front[ -]?end)/iu;

export function implementationQuery(query) {
 const latest=query.split(marker).at(-1);
 const onlyFrontend=frontendOnly.test(latest) && !/(?:не\s+только|not\s+only)\s+(?:фронтенд\p{L}*|интерфейс\p{L}*|front[ -]?end)/iu.test(latest);
 const scope=onlyFrontend ? latest : query;
 if (!create.test(query) || (!web.test(scope) && !backend.test(scope))) return null;
 const intent=query.includes(marker) && create.test(latest) ? latest : query;
 if (negatedCreate.test(intent)) return null;
 if (auxiliaryOutput.test(intent)) return null;
 if (backend.test(scope) && !onlyFrontend) return 'создать backend API fullstack приложение требования архитектура реализация тестирование feature development pipeline requirements implementation testing code generation Step 7 CODE_CHANGES independent module file';
 return 'создать функциональный веб интерфейс сайт страница frontend design functional interactive web applications components';
}
