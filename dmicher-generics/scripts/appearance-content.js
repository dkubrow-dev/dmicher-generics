import { escapeHTML } from "./utilities.js";

const words = {
  en: {
    title: "dmicher — Appearance and windows", menu: "Appearance and windows", open: "Configure",
    hint: "One appearance for all dmicher module windows on this browser.", appearance: "Window appearance",
    behavior: "Module window behavior", theme: "Built-in style", themeHint: "Choose the same dark or light style for all dmicher windows.",
    dark: "Dark", light: "Light", snapScreen: "Snap to screen edges", snapScreenHint: "A dragged window snaps within 12 pixels of the screen edge. Move the pointer away to release it.",
    snapWindows: "Snap to module windows", snapWindowsHint: "Snap beside another dmicher window within 12 pixels; other Foundry windows are ignored.",
    snapCorners: "Align corners while snapped", snapCornersHint: "Also align the top, bottom, left or right ends of adjacent edges.",
    snapCenters: "Align centers while snapped", snapCentersHint: "Also align a window with the middle of its adjacent screen edge or window.",
    snapCascadeRightButton: "Move snapped windows with the right mouse button", snapCascadeRightButtonHint: "Drag the title of a snapped window with the right mouse button to move its entire connected group. A left-button drag releases only that window.",
    custom: "Custom style layer — Premium", customHint: "Import a CSS file to apply over the selected built-in style. This browser keeps the file contents when access expires.",
    import: "Import CSS", remove: "Remove imported style", available: "Your imported style is applied over the built-in style.",
    unavailable: "Premium access for dmicher Generics is required to import and apply a custom style. Your saved style is retained.",
    empty: "No custom style imported.", stored: "Custom style saved", save: "Save", help: "Help", helpTitle: "dmicher — Appearance help",
    invalid: "The style could not be imported. Use a CSS file up to 64 KiB with style rules, @media or @supports, without external imports or other global rules.",
    saved: "Appearance and window behavior saved.", failed: "Unable to save appearance settings.",
    contents: "Contents", resizeNavigation: "Resize navigation", author: "Author", thanks: "Thanks", modules: "dmicher modules",
    guide: "Arrange your windows", settings: "Settings", layer: "Apply your own style", basics: "Choose a common appearance"
  },
  ru: {
    title: "dmicher — Оформление и окна", menu: "Оформление и окна", open: "Настроить",
    hint: "Единое оформление окон всех модулей dmicher в этом браузере.", appearance: "Внешний вид окон",
    behavior: "Поведение окон модулей", theme: "Встроенный стиль", themeHint: "Выберите общий тёмный или светлый стиль для всех окон dmicher.",
    dark: "Тёмный", light: "Светлый", snapScreen: "Прилипание к краям экрана", snapScreenHint: "Переносимое окно прилипает в пределах 12 пикселей от края. Отведите курсор, чтобы отлепить окно.",
    snapWindows: "Прилипание к окнам модулей", snapWindowsHint: "Окно прилипает снаружи другого окна dmicher в пределах 12 пикселей. Прочие окна Foundry не учитываются.",
    snapCorners: "Выравнивание по углам при прилипании", snapCornersHint: "Дополнительно выравнивает начало или конец соседних сторон окон и края экрана.",
    snapCenters: "Выравнивание по центрам", snapCentersHint: "Дополнительно совмещает середины соседних сторон окон или середину края экрана.",
    snapCascadeRightButton: "Перемещать прилипшие окна правой кнопкой мыши", snapCascadeRightButtonHint: "Перетащите заголовок прилипшего окна правой кнопкой, чтобы перенести весь связанный каскад. Перенос левой кнопкой отделяет только выбранное окно.",
    custom: "Свой слой стиля — Premium", customHint: "Импортируйте CSS-файл поверх выбранного встроенного стиля. Содержимое файла сохраняется в этом браузере и после окончания доступа.",
    import: "Импорт CSS", remove: "Удалить свой стиль", available: "Ваш стиль применяется поверх выбранного встроенного стиля.",
    unavailable: "Для импорта и применения своего стиля нужен Premium-доступ к dmicher Generics. Сохранённый стиль не удаляется.",
    empty: "Свой стиль ещё не импортирован.", stored: "Свой стиль сохранён", save: "Сохранить", help: "Справка", helpTitle: "dmicher — Справка по оформлению",
    invalid: "Не удалось импортировать стиль. Нужен CSS-файл до 64 КиБ с правилами стиля, @media или @supports, без внешних импортов и других глобальных правил.",
    saved: "Оформление и поведение окон сохранены.", failed: "Не удалось сохранить настройки оформления.",
    contents: "Содержание", resizeNavigation: "Изменить ширину меню", author: "Об авторе", thanks: "Благодарности", modules: "Модули dmicher",
    guide: "Разместить окна", settings: "Настройки", layer: "Применить свой стиль", basics: "Выбрать общее оформление"
  }
};

export const appearanceText = () => words[globalThis.game?.i18n?.lang?.startsWith("ru") ? "ru" : "en"];
export function appearanceHelpContent() {
  const t = appearanceText(), ru = globalThis.game?.i18n?.lang?.startsWith("ru");
  const p = (text) => `<p>${text}</p>`;
  const pages = [
    { id: "appearance", title: t.basics, html: p(ru
      ? "Откройте настройки Foundry → dmicher Generics → «Оформление и окна». Выберите встроенный стиль и сохраните. Все окна dmicher в этом браузере получат одинаковое оформление. Другие участники выбирают оформление у себя."
      : "Open Foundry Settings → dmicher Generics → Appearance and windows. Choose a built-in style and save. All dmicher windows in this browser use it. Other participants choose their own appearance.") + p(ru
        ? "«Сохранить» применяет изменения и оставляет окно открытым: можно сразу продолжить настройку. Закройте окно крестиком, когда закончите."
        : "Save applies your changes and leaves the window open so you can continue adjusting. Close it with the title-bar close button when finished.") },
    { id: "windows", title: t.guide, html: p(ru
      ? "Перетащите окно за заголовок к краю экрана или к соседнему окну dmicher. В пределах 12 пикселей окно прилипнет. Отведите курсор дальше этого расстояния, чтобы продолжить свободное перемещение. Выравнивание углов и центров помогает собрать компактное рабочее место."
      : "Drag a window by its title toward the screen edge or another dmicher window. Within 12 pixels it snaps into place. Move the pointer farther away to continue freely. Corner and center alignment helps arrange a compact workspace.") + p(ru
      ? "Прилипание действует при переносе обычных окон. Встроенная панель Конструктора, изменение размера и автоматическое восстановление расположения окон от него не зависят."
      : "Snapping applies when dragging floating windows. It does not affect the docked Constructor panel, resizing or automatic restoration of window positions.") + p(ru
      ? "Чтобы перенести собранный каскад целиком, зажмите правую кнопку на заголовке одного из прилипших окон и перетащите его. Положение окон друг относительно друга сохраняется. Перенос левой кнопкой отделяет выбранное окно. Закрытие окна, изменение его размера или отключение прилипания к окнам разрывает его связи. Отдельное окно браузера образует своё рабочее место."
      : "To move an assembled group, hold the right mouse button on the title of a snapped window and drag. Relative window positions stay unchanged. A left-button drag releases the selected window. Closing or resizing a window, or disabling window snapping, releases its links. Each separate browser window has its own workspace.") },
    { id: "custom-style", title: t.layer, html: p(ru
      ? "При активном Premium-доступе к Generics выберите «Импорт CSS» в настройках оформления, укажите подготовленный файл и сохраните. Свой стиль добавляется поверх встроенного; «Удалить свой стиль» возвращает только встроенный. При окончании доступа слой отключается, а сохранённый файл снова применяется после восстановления доступа."
      : "With active Premium access for Generics, choose Import CSS in appearance settings, select your prepared file and save. The custom layer is applied over the built-in style; Remove imported style restores the built-in style alone. When access expires, the layer stops applying. It is saved and applies again after access is restored.") + p(ru
      ? "Поддерживаются CSS-файлы до 64 КиБ с оформлением окон dmicher, включая адаптивные правила @media и @supports. Внешние импорты и глобальные правила шрифтов или анимаций не поддерживаются. Стиль ограничен окнами dmicher."
      : "CSS files up to 64 KiB may style dmicher windows and include @media and @supports rules. External imports and global font or animation rules are unsupported. The style is confined to dmicher windows.") },
    { id: "settings", title: t.settings, html: ["theme", "snapScreen", "snapWindows", "snapCorners", "snapCenters", "snapCascadeRightButton"].map((key) =>
      `<section id="${key}"><h2>${escapeHTML(t[key])}</h2>${p(escapeHTML(t[`${key}Hint`]))}</section>`).join("")
      + p(ru ? "Оба вида прилипания, углы и центры по умолчанию включены. Выравнивания доступны, когда включён хотя бы один вид прилипания, и применяются только к нему."
        : "Both snapping options, corners and centers are enabled by default. Alignment options are available while either snapping option is enabled and apply only to enabled targets.")
      + `<section id="customStyles"><h2>${escapeHTML(t.custom)}</h2>${p(escapeHTML(t.customHint))}</section>` },
    { id: "author", title: t.author, html: p(ru ? "dmicher — инструменты для удобного проведения настольных ролевых игр." : "dmicher creates tools for comfortable tabletop roleplaying sessions.") + '<p><a href="https://boosty.to/dmicher" target="_blank" rel="noopener noreferrer">Boosty — dmicher</a></p>' },
    { id: "thanks", title: t.thanks, html: p(ru ? "Спасибо мастерам и игрокам, которые проверяют инструменты в игре, сообщают о неудобствах и помогают сделать работу за столом проще." : "Thank you to the GMs and players who test these tools in play, report difficulties and help make sessions easier to run.") },
    { id: "modules", title: t.modules, html: p(ru ? "Подберите инструменты под свою игру. Каждый модуль отвечает за свою часть работы за столом." : "Choose the tools that fit your game. Each module supports a different part of the session.")
      + (ru ? "<ul><li><strong>Spotlight:</strong> следите за очередью заявок и участниками, которым давно не предоставляли слово; проводите опросы и перерывы.</li><li><strong>Ширма мастера:</strong> готовьте эпизоды сцены, связывайте взаимодействия и переключайтесь к ручному управлению, когда ход игры меняется.</li><li><strong>Generics:</strong> выбирайте единый вид окон, собирайте удобное рабочее место и пользуйтесь знакомой навигацией справки.</li><li><strong>Premium:</strong> подключайте дополнительные возможности доступных модулей. Доступ настраивается в настройках Foundry → dmicher Premium.</li><li><strong>Сервер лицензий:</strong> обслуживает доступ к премиальным возможностям и выпускам; отдельное игровое окно для него не нужно.</li></ul>"
      : "<ul><li><strong>Spotlight:</strong> manage requests, notice participants waiting for a turn, run polls and organize breaks.</li><li><strong>Master screen:</strong> prepare scene episodes, connect interactions and return to manual control when play changes direction.</li><li><strong>Generics:</strong> choose a shared window appearance, arrange your workspace and use familiar help navigation.</li><li><strong>Premium:</strong> add extra capabilities to supported modules. Configure access in Foundry Settings → dmicher Premium.</li><li><strong>Licence server:</strong> handles access to premium capabilities and releases; it needs no separate in-game window.</li></ul>") }
  ];
  return { pages, tree: [{ id: "guide", title: t.guide, pageId: "windows", children: [{ id: "appearance", title: t.basics, pageId: "appearance" }, { id: "custom-style", title: t.layer, pageId: "custom-style" }] }, { id: "settings", title: t.settings, pageId: "settings" }], footer: ["author", "thanks", "modules"], labels: t };
}
