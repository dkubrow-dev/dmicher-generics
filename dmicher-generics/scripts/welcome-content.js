import { escapeHTML } from "./utilities.js";
import { renderActionButton } from "./chat/actions.js";

const words = {
  ru: { name: "Приветствие модулей dmicher", hint: "Отправлять каждому участнику личное приветствие при загрузке с перечнем активных модулей, ссылками на справку и настройки. Не отключает остальные сообщения Информатора.",
    title: "Модули Дмичера активированы:", module: "модуль", version: "версии", help: "справка", settings: "НАСТРОЙКАХ ИГРОВОГО МЕНЮ",
    gmBefore: "Настройте все модули под себя и под своих игроков в", gmAfter: ". Сообщите им, что они также могут настроить модули под себя.",
    playerBefore: "Некоторые модули серии могут быть настроены игроками под себя в", playerAfter: ".",
    premium: "Используется лицензионная премиум версия.", thanks: "Выражаю отдельную признательность за вашу поддержку.", free: "Используется бесплатная лицензия.",
    supportBefore: "Вы можете оформить подписку на лицензию", support: "ПО ССЫЛКЕ", supportAfter: ", чтобы получить больше настроек и премиальные функции.",
    regards: "С уважением,", missing: "Этот модуль сейчас недоступен. Проверьте список активных модулей." },
  en: { name: "dmicher module welcome", hint: "Send each participant a private welcome on loading, with active modules, help and settings links. Other Informer messages remain enabled.",
    title: "The dmicher modules are active:", module: "module", version: "version", help: "help", settings: "GAME SETTINGS",
    gmBefore: "Configure all modules for yourself and your players in", gmAfter: ". Let your players know that they can also adjust the modules for themselves.",
    playerBefore: "Some modules in the series can be adjusted by players in", playerAfter: ".",
    premium: "A licensed Premium version is in use.", thanks: "Thank you especially for your support.", free: "A free licence is in use.",
    supportBefore: "You can subscribe for a licence", support: "AT THIS LINK", supportAfter: " to get more settings and premium features.",
    regards: "With respect,", missing: "This module is currently unavailable. Check the active module list." }
};
export const welcomeText = () => words[game.i18n?.lang?.startsWith("ru") ? "ru" : "en"];
export function buildWelcomeContent({ modules, gm, premium }) {
  const t = welcomeText(), e = escapeHTML;
  return `<section class="dmicher-welcome"><p>${e(t.title)}</p><ul>${modules.map((module) =>
    `<li>${e(t.module)} «${e(module.title)}» ${e(t.version)} ${e(module.version)}${module.help ? ` — ${renderActionButton({ id: `help:${module.id}`, label: t.help })}` : ""}</li>`).join("")}</ul>
    <p>${e(gm ? t.gmBefore : t.playerBefore)} ${renderActionButton({ id: "settings", label: t.settings })}${e(gm ? t.gmAfter : t.playerAfter)}</p>
    <p>${e(premium ? t.premium : t.free)}</p>${premium ? `<p>${e(t.thanks)}</p>` : gm ? `<p>${e(t.supportBefore)} <a href="https://boosty.to/dmicher" target="_blank" rel="noopener noreferrer">${e(t.support)}</a>${e(t.supportAfter)}</p>` : ""}
    <p>${e(t.regards)}<br>dmicher abathur kubrow</p></section>`;
}
