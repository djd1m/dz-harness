// Identify requested software output independently of the business topic it describes.
const create=/(?:сдела\p{L}*|созда\p{L}*|разработ\p{L}*|собра\p{L}*|build|create|implement)/iu;
const web=/(?:сайт\p{L}*|страниц\p{L}*|веб[ -]?\p{L}*|браузер\p{L}*|website|web\s+app|browser|frontend)/iu;

export function implementationQuery(query) {
 if (!create.test(query) || !web.test(query)) return null;
 if (/(?:не\s+(?:создавай|делай|разрабатывай)|do\s+not\s+(?:build|create))/iu.test(query)) return null;
 if (/(?:созда\p{L}*|сдела\p{L}*|собра\p{L}*|build|create)\s+(?:\p{L}+\s+)?(?:тест\p{L}*|бэкап\p{L}*|резервн\p{L}*|backup|tests?)(?!\p{L})/iu.test(query)) return null;
 return 'создать функциональный веб интерфейс сайт страница frontend design functional interactive web applications components';
}
