# dmicher Generics

Общий бесплатный Foundry-модуль для семейства dmicher. Из Spotlight выделены общие стили окон, управление их жизненным циклом, экранирование HTML и последовательная очередь задач. Добавлен небольшой версионируемый реестр API, через который модули находят друг друга. Игровые правила, лицензирование и автоматизация эпизодов остаются в соответствующих модулях.

Начальная версия — **1.0.0**, публичный контракт — **API 1**, целевые версии Foundry VTT — **13 и 14**. Это локальная разработка: адреса релизов в манифесте предназначены для будущей публикации и не означают, что релиз уже доступен на GitHub.

## Установка и границы

Устанавливаемое содержимое находится в `dmicher-generics/`; в Foundry оно помещается в `Data/modules/dmicher-generics/`. Модуль нужно включить вместе с потребителем. Он не требует Premium, системы или серверного компонента и сам не создаёт настроек, сокетов, телеметрии и элементов управления.

Обязательных сторонних библиотек и Foundry-модулей нет. Generics служит общей инфраструктурой dmicher; расширение общей библиотеки предпочтительнее копирования одинаковых методов в потребителей. Предметные интеграции и их явный выбор остаются в настройках соответствующего модуля.

Манифест версии1.0.0: `https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json`. Это предполагаемый адрес конкретного релиза. Поле `manifest` одинаково в исходниках, отдельном артефакте и ZIP; сборка отвергает `latest`, другой номер релиза и несогласованный `download`.

Обновлённый Spotlight использует обязательную зависимость от Generics. Premium по-прежнему необязателен: бесплатные функции Spotlight не зависят от лицензии. Master screen может использовать тот же контракт без импорта логики Spotlight.

## Подключение API

Из файла `scripts/*.js` соседнего установленного модуля:

```js
import { requireApiVersion } from "../../dmicher-generics/scripts/api.js";
const generics = requireApiVersion(1);
```

Такой импорт работает до Foundry `init` и не зависит от порядка вызова обработчиков `init`. На `init` тот же объект публикуется в `game.modules.get("dmicher-generics").api`, затем вызывается hook `dmicherGenericsReady(api)`. `requireApiVersion` немедленно сообщает о несовместимом основном контракте. Добавляйте `dmicher-generics` в `relationships.requires` манифеста потребителя с `minimum: "1.0.0"` и точным манифестом `https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json`.

### Окна и темы

```js
const windowTheme = generics.theme.createWindowThemeController({
  windowClass: "dmicher-example-window",
  getTheme: () => game.settings.get("dmicher-example", "theme")
});

// В DEFAULT_OPTIONS.classes класса ApplicationV2:
windowTheme.classes("dmicher-example-editor");

// На init, после регистрации собственных настроек:
windowTheme.install();
// При смене настройки темы и на ready:
windowTheme.apply();
// При демонтаже интеграции, если он нужен:
windowTheme.dispose();
```

Темы `dark` и `light` используют CSS-переменные `--dmicher-*`, перенесённые из Spotlight. Общие правила действуют исключительно внутри `.dmicher-window`. Контроллер помечает окна конкретного потребителя `data-dmicher-theme`; он не меняет тему других модулей и не регистрирует глобальную настройку. У Spotlight сохраняются прежняя клиентская настройка и отдельные стили его инструментов. Разметка, размеры и содержимое окон принадлежат потребителю.

Смена темы обновляет и нативные вынесенные окна Foundry 14 через реестр открытых `foundry.applications.instances`, доступный также в Foundry 13. Поэтому возвращённое в основное окно приложение сохраняет актуальную тему без повторного рендера. Закрытые экземпляры удаляет сам Foundry; контроллер не хранит собственный список приложений.

`windows.openSingletonApplication(current, create, { moduleId })` повторно использует открытое или ещё рендерящееся окно, поднимает готовое окно и снимает блокировку после ошибки. Вызывающий хранит возвращённый экземпляр. Это не система сохранения произвольных окон.

`windows.runAfterApplicationLifecycle(result, continuation)` выполняет продолжение после успешного завершения родительского lifecycle. Ошибка родителя передаётся вызывающему; продолжение не выполняется.

`windows.getRenderedElement(value)` принимает элемент, jQuery-подобную обёртку или приложение с `.element`; поддерживает DOM-элементы из другого window realm. `windows.moveSettingFirst(application, html, { moduleId, settingKey })` поднимает выбранную настройку в категории стандартного окна настроек Foundry.

### Общие утилиты

`utilities.escapeHTML(value)` экранирует текст для HTML-контекста. Он не является валидатором URL или обработчиком произвольного CSS.

`utilities.createSerialTaskQueue()` возвращает `enqueue(task)`: задачи одного экземпляра очереди выполняются по порядку, ошибка возвращается вызывающему и не ломает следующие задачи. Очередь локальна для браузера; она не выбирает ведущего GM, не обеспечивает сетевую идемпотентность и не выполняет транзакционный откат.

### Интеграции dmicher

```js
const publicApi = { openEditor: () => editor.open() };
const unregister = generics.modules.register("dmicher-example", {
  apiVersion: 1,
  api: publicApi,
  capabilities: ["openEditor"]
});

const spotlight = generics.modules.get("dmicher-spotlight-tools", { apiVersion: 1 });
spotlight?.openFocusAudit();
const available = generics.modules.list();
```

Реестр содержит только явно зарегистрированные API `dmicher-*`. Несовпадение версии и отсутствие модуля дают `null`; повторная регистрация одного ID отклоняется. `list()` возвращает копии описаний с именами возможностей. `unregister()` удаляет именно выданную регистрацию. Hook `dmicherModuleRegistryChanged(event, record)` сообщает о регистрации и удалении. Потребитель должен запросить API после регистрации интересующего его модуля либо обработать этот hook.

Реестр предназначен для обнаружения методов, а не для выдачи прав. Каждый метод самостоятельно проверяет права пользователя, доступ Premium и состояние мира. В реестр нельзя публиковать секреты; найденные возможности не запускаются автоматически. Адаптеры сторонних модулей, бизнес-правила и интерфейс осознанного выбора исполнителя относятся к Master screen.

Spotlight сохраняет `dmicherSpotlightReady`, прежний объект `game.modules.get(...).api` и Premium provider API; дополнительно регистрирует API 1 и возможности открытия своих основных окон. Существующим интеграциям не нужно менять прежние вызовы.

## Разработка и проверка

```text
npm test
npm run deploy:dry-run
npm run deploy
npm run release:build
npm run release:verify
```

Тестам требуется Node.js с поддержкой `node:test`; зависимостей npm нет. Runtime-модуль не требует Node.js в браузере. Тесты Spotlight дополнительно используют узкий Node resolver: установленные Foundry-модули лежат рядом, а исходники каждого репозитория — во вложенной папке. В общей рабочей папке репозитории Spotlight и Generics должны быть соседями; общий код в тестах не подменяется копией или заглушкой.

Сборка создаёт ZIP с файлами в корне и отчёт SHA256 в `../artifacts/dmicher-generics/1.0.0/`. `.resources/` исключена из Git и не входит в устанавливаемую папку. `release:verify` сверяет архив, исходники и все три локальные установки, поэтому до деплоя ожидаемо не пройдёт. `deploy` применяет только актуальный просмотренный `deploy-plan.json`, отказывает при изменении источников, проверяет точные пути и ссылки/junction и удаляет только перечисленные файлы внутри модуля.

Цели: пользовательская установка AppData и portable Foundry 13.351/14.366; Foundry 12 не изменяется. ZIP не содержит исходников тестов, `.resources`, Git или настроек пользователей. Скрипты сборки и ZIP перенесены из Spotlight с заменой ID компонента; это инструментарий разработки, а не часть runtime API.

## English summary

Free, system-independent shared module for Foundry VTT 13/14. Provides scoped window CSS, per-consumer theme controllers, ApplicationV2 lifecycle helpers, HTML escaping, a client-local serial queue, and an opt-in versioned dmicher API registry. No Premium, socket, settings or telemetry dependency. Version 1.0.0 / API 1; local development, not yet a published release. Consumers retain game rules, permissions, settings and UI content. See the API examples and verification commands above.
