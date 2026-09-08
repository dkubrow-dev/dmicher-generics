# dmicher Generics 1.0.0

Начальное выделение общей инфраструктуры из Spotlight; локальная сборка для разработки комплекта.

- Общие палитры и элементы оформления окон применяются только к `.dmicher-window`.
- Темами управляет каждый модуль отдельно; пользовательские настройки Spotlight сохраняются.
- Вынесены повторное открытие одиночного окна, ожидание его жизненного цикла, получение DOM-элемента, порядок настроек, HTML-экранирование и последовательная очередь задач.
- Добавлен публичный API 1 и реестр API модулей `dmicher-*` с явными версиями и возможностями.
- Нет зависимостей от игровой системы, Premium и сервера лицензий. Поддерживаются Foundry VTT 13/14.
- Добавлены самостоятельные тесты, воспроизводимая ZIP-сборка и проверяемый локальный деплой.
- Манифест указывает точную версию релиза1.0.0; отдельный артефакт, ZIP и исходники сверяются побайтно. Сборка отклоняет изменяемые или несогласованные ссылки.

API 1 is the initial shared contract for dmicher modules. Per-consumer themes preserve existing Spotlight settings. Window helpers and local API discovery do not implement gameplay, network authority or licensing. This is a local development build, not confirmation of a public GitHub release.
