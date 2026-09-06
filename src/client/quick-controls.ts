import type { SoundBus } from "./audio";

export function installQuickControls(
  audio: SoundBus,
  descriptions: string[],
  names: readonly string[],
) {
  const mixer = document.createElement("details");
  mixer.className = "quick-mixer";
  mixer.innerHTML = `<summary aria-label="Sound levels">Sound <span aria-hidden="true">⌄</span></summary><div class="quick-mixer-panel"><label for="quick-music">Music <output id="quick-music-value"></output></label><input id="quick-music" aria-label="Quick music volume" type="range" min="0" max="100"><label for="quick-effects">Effects <output id="quick-effects-value"></output></label><input id="quick-effects" aria-label="Quick effects volume" type="range" min="0" max="100"></div>`;
  document.querySelector(".top-actions")!.prepend(mixer);
  const music = mixer.querySelector<HTMLInputElement>("#quick-music")!;
  const effects = mixer.querySelector<HTMLInputElement>("#quick-effects")!;
  const sync = () => {
    music.value = String(Math.round(audio.levels.music * 100));
    effects.value = String(Math.round(audio.levels.effects * 100));
    mixer.querySelector("#quick-music-value")!.textContent = music.value + "%";
    mixer.querySelector("#quick-effects-value")!.textContent =
      effects.value + "%";
  };
  mixer.addEventListener("toggle", sync);
  for (const slider of [music, effects])
    slider.addEventListener("input", () => {
      audio.setLevels(Number(music.value) / 100, Number(effects.value) / 100);
      localStorage.setItem("dd-mix", JSON.stringify(audio.levels));
      sync();
    });
  sync();
  const tooltip = document.createElement("div");
  tooltip.id = "location-tip";
  tooltip.className = "location-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let current: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const hide = () => {
    clearTimeout(timer);
    tooltip.hidden = true;
    current?.removeAttribute("aria-describedby");
    current = undefined;
  };
  const show = (button: HTMLElement, index: number) => {
    clearTimeout(timer);
    current?.removeAttribute("aria-describedby");
    current = button;
    tooltip.replaceChildren();
    const heading = document.createElement("strong"),
      text = document.createElement("p");
    heading.textContent = names[index];
    text.textContent =
      "When awakened: " + descriptions[index].replace(/^[^:]+:\s*/, "");
    tooltip.append(heading, text);
    tooltip.hidden = false;
    button.setAttribute("aria-describedby", tooltip.id);
    const box = button.getBoundingClientRect();
    tooltip.style.left = `${Math.max(10, Math.min(innerWidth - tooltip.offsetWidth - 10, box.left + box.width / 2 - tooltip.offsetWidth / 2))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(innerHeight - tooltip.offsetHeight - 10, box.bottom + 9))}px`;
  };
  const leave = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, 150);
  };
  document
    .querySelectorAll<HTMLElement>("[data-location]")
    .forEach((button, index) => {
      button.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "touch") {
          clearTimeout(timer);
          timer = setTimeout(() => show(button, index), 180);
        }
      });
      button.addEventListener("pointerleave", leave);
      button.addEventListener("focus", () => show(button, index));
      button.addEventListener("blur", leave);
      button.addEventListener("click", () => show(button, index));
    });
  tooltip.addEventListener("pointerenter", () => clearTimeout(timer));
  tooltip.addEventListener("pointerleave", leave);
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    if (!mixer.contains(target)) mixer.open = false;
    if (!tooltip.contains(target) && !current?.contains(target)) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    hide();
    if (mixer.open) {
      mixer.open = false;
      mixer.querySelector("summary")!.focus();
    }
  });
  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, true);
}
