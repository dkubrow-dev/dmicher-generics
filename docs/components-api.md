# Контекстные компоненты, API 1

`generics.components` содержит простые элементы форм для Ширмы и других модулей. Они не знают правил схем, событий, макросов, предметов и лицензий.

## Цвет

`renderColorField({name, value, label})` возвращает экранированную разметку: подпись, текстовое поле с именем `name` и стандартную палитру браузера без имени. `value` — только `#RRGGBB`; `normalizeHexColor(value)` проверяет формат и возвращает верхний регистр. Поэтому в FormData попадает одно значение, которое удобно копировать.

После вывода вызвать `bindColorFields(root)`. Ввод в текст меняет палитру, выбор в палитре — текст и его события `input`/`change`. Некорректный текст не заменяется молча и делает поле невалидным. Возвращённый disposer освобождает слушателей. Потребитель сохраняет значение своим обычным способом и проверяет его на границе своего хранилища.

## JSON

```js
const transfer = generics.components.createJSONTransfer({
  filename: () => "episode.json",
  exportValue: () => selectedEpisode(),
  validate: value => normalizeAndValidateEpisode(value),
  importValue: value => saveInSelectedScene(value),
  onError: error => ui.notifications.error(error.message)
});
// Trusted HTML from the shared renderer; labels come from the consumer's RU/EN text.
const html = generics.components.renderJSONControls({id: "episode", importLabel, exportLabel});
const dispose = transfer.bind(root, "episode");
```

`validate` обязательно возвращает проверенный/нормализованный объект; `false`, `undefined` и скаляр отвергаются. Все три содержательных callback могут быть асинхронными. `importFile(file)` проверяет размер, разбирает JSON, вызывает `validate`, затем ровно один раз `importValue`. `export(document?)` получает ситуативный объект через `exportValue`, проверяет его, скачивает JSON и возвращает его строку. По умолчанию предел — 5 МиБ, его можно уменьшить через `maxBytes`. Экспорт освобождает Blob URL. Ошибки разбора, проверки и применения не маскируются автоматическим повтором.

`bind(root, id)` обслуживает только свои кнопки `renderJSONControls` и скрытый файловый input. Повторный клик блокируется на время операции; disposer удаляет input и слушатели. Самостоятельные вызовы `export`/`importFile` доступны без кнопок. Никаких чтений мира или записи в Foundry компонент сам не выполняет.

Права, актуальность выбранной сцены/объекта после выбора файла, версия формата, допустимые поля и ссылки принадлежат потребителю. Он должен перепроверить контекст в `importValue`, если за время чтения файла выбор мог измениться. Закрытие панели не отменяет уже начатую предметную операцию. JSON не исполняет код; произвольные значения не вставляются как HTML.
