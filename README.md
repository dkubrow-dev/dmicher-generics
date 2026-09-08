# dmicher Generics

Общий бесплатный Foundry-модуль для семейства dmicher. Из Spotlight выделены общие стили окон, управление их жизненным циклом, экранирование HTML, последовательная очередь задач, технические личности и повторяемое поведение сообщений чата. Небольшой версионируемый реестр API позволяет модулям находить друг друга; необязательный мост Premium подключает реализации объявленных методов. Игровые правила, лицензирование и автоматизация эпизодов остаются в соответствующих модулях.

Начальная версия — **1.0.0**, публичный контракт — **API 1**, целевые версии Foundry VTT — **13 и 14**. Это локальная разработка: адреса релизов в манифесте предназначены для будущей публикации и не означают, что релиз уже доступен на GitHub.

## Установка и границы

Устанавливаемое содержимое находится в `dmicher-generics/`; в Foundry оно помещается в `Data/modules/dmicher-generics/`. Модуль нужно включить вместе с потребителем. Он не требует Premium, системы или серверного компонента. Импорт API не создаёт настройки, документы и элементы управления. Потребитель явно включает нужные механизмы; сервис технической личности при активации подключает обработчик сокета и освобождает его через `dispose`. Телеметрии в Generics нет.

Обязательных сторонних библиотек и Foundry-модулей нет. Generics служит общей инфраструктурой dmicher. Сюда выделяется подтверждённое общее поведение с конкретным потребителем; частные функции и предметные настройки не переносятся ради формального переиспользования. Предметные интеграции и их явный выбор остаются в настройках соответствующего модуля.

Манифест версии1.0.0: `https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json`. Это предполагаемый адрес конкретного релиза. Поле `manifest` одинаково в исходниках, отдельном артефакте и ZIP; сборка отвергает `latest`, другой номер релиза и несогласованный `download`.

Обновлённые Spotlight и Premium требуют только Generics как общую инфраструктуру. Premium остаётся необязательным для Spotlight: бесплатные функции не зависят от лицензии. Master screen может использовать тот же контракт без импорта логики Spotlight. Generics ничего не импортирует из продуктовых модулей или Premium; циклической зависимости нет.

Применяем KISS и SOLID: небольшие тематические части, конкретная ответственность, узкие версионируемые договоры и совместимые расширения. Generics объединяет оформление и технические способы взаимодействия. Он не содержит каталог премиальных функций, настройки целевых модулей или правила лицензирования. Полные общие правила находятся в родительском `AGENTS.md`.

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

### Чат и технические личности

`generics.chat` управляет технической парой User/Actor, доставляет публичные сообщения или приватные копии, отслеживает документы по владельцу/каналу/ключу и привязывает кнопки к актуальному видимому сообщению. Он также предоставляет общий renderer портретов. Обычный НПС передаётся как явный `speaker` без создания технической личности.

Тексты, заявки, опросы, настройки отображения и предметные права остаются у потребителя. Пустой приватный список никому не отправляется; автор и адресат различаются по правилам Foundry. Метки и локальная очередь не заменяют авторизацию и не гарантируют сетевое выполнение ровно один раз. Полный контракт, примеры и миграция Spotlight описаны в [docs/chat-api.md](docs/chat-api.md).

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

Spotlight сохраняет `dmicherSpotlightReady`, API открытия инструментов и их регистрацию в API 1. Прежняя прямая регистрация Premium-провайдера в Spotlight удалена: соединение проходит только через описанный ниже мост. Обновлённые Generics, Premium и Spotlight устанавливаются согласованным комплектом.

### Премиальные реализации методов

`generics.premium` — технический мост протокола 1. Базовый модуль объявляет используемые методы и предоставляет законченные бесплатные реализации. Premium хранит и регистрирует тематические расширения; он же проверяет доступ. Generics не решает, какие функции платные, и не читает лицензионные данные.

```js
const client = generics.premium.forModule("dmicher-example", {
  apiVersion: 1,
  methods: ["resolveOptions"]
});
const base = (stored) => ({ label: stored.label, compact: false });
const effective = client.invoke("resolveOptions", [stored], base,
  (value) => Boolean(value && typeof value.compact === "boolean"));
const unsubscribe = client.subscribe((status) => refreshConfiguration(status));
await client.waitUntilReady();
// Явная команда открытия настроек, права проверяет сам Premium:
client.openSettings();
// При освобождении клиента:
unsubscribe();
```

Единственный провайдер подключается из Premium. Следующий пример показывает договор; `verifiedAccess`, `readyPromise` и `openLicenseSettings` предоставляет собственная инфраструктура Premium.

```js
const registration = generics.premium.registerProvider({
  apiVersion: 1,
  readyPromise,
  hasAccess: (moduleId) => verifiedAccess(moduleId),
  openSettings: openLicenseSettings,
  extensions: [{
    moduleId: "dmicher-example",
    apiVersion: 1,
    methods: {
      resolveOptions: (base, stored) => ({ ...base(stored), compact: Boolean(stored.compact) })
    }
  }]
});
// После изменения подтверждённого состояния доступа:
registration.notifyChanged();
// При отключении провайдера:
registration.dispose();
```

`invoke` применим только к чистым синхронным вычислениям. Базовый метод заранее вычисляет независимое значение для fallback, поэтому не должен иметь побочных эффектов; повторный вызов из расширения также создаёт самостоятельный результат. Потребитель защищает входные данные, нормализует результат и ограничивает разрешённые для замены поля. Через этот метод нельзя проводить создание документов, покупки, воспроизведение звука или другие команды: автоматическое возвращение базового результата не отменяет уже произошедшие последствия.

Отсутствие провайдера, несовпадение версии/набора методов, отказ доступа дают бесплатный результат. Доступ проверяется при каждом обращении. Исключение, Promise или результат, отклонённый валидатором, отключают расширение данного целевого контракта до `notifyChanged`; другие цели независимы. Ошибка базового метода остаётся ошибкой потребителя. Административная команда `openSettings` выполняется только явно, возвращает `null` при отсутствии и передаёт ошибку провайдера вызывающему без повторения другой команды.

`getStatus()` различает `available`, `compatible`, `active` и `settingsAvailable`. Один статус не является премиальной реализацией. Действия одного целевого модуля и версии контракта разделяют предел ожидания готовности (по умолчанию 50 секунд); другой модуль имеет самостоятельный срок. Отказ запуска, тайм-аут и снятие провайдера освобождают ожидание. Регистрация не зависит от существования целевого модуля. Подписки освобождаются по выданной функции; старая регистрация не может снять новую. Это локальная координация, а не граница безопасности между произвольными скриптами клиента.

Версия основного API остаётся 1: существующие пространства имён сохранены, `premium` добавлен к ним. Код лицензирования, список целевых расширений и игровые модели не входят в Generics.

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

Free, system-independent shared module for Foundry VTT 13/14. Provides scoped window CSS, per-consumer theme controllers, ApplicationV2 lifecycle helpers, HTML escaping, a local serial queue, managed technical identities, explicit chat delivery and interactive controls, a versioned dmicher API registry and an optional bridge for pure synchronous Premium method overrides. No Premium or external-library dependency. Identity sockets are attached explicitly by consumers; settings and domain rules remain consumer-owned. No telemetry. KISS/SOLID keep domain code and licence policy in their owning modules. Version 1.0.0 / API 1; local development, not yet a published release. See the contracts and verification commands above.
