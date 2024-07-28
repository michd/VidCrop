import { delayMs } from "./util.js";

const COPY_SUCCESS_CLASS = "copy_success";
const STATUS_FLASH_DURATION_MS = 1000;

export class CommandCopyController {
    #$output;

    constructor($container) {
        this.#$output = $container.querySelector("output");
        this.#$output.addEventListener("click", this.#onOutputClick.bind(this));
    }

    async #onOutputClick() {
        try {
            await navigator.clipboard.writeText(this.#$output.innerText);
            this.#$output.classList.add(COPY_SUCCESS_CLASS);
            await delayMs(STATUS_FLASH_DURATION_MS);
            this.#$output.classList.remove(COPY_SUCCESS_CLASS);
        } catch(error) {
            console.error(`failed to copy to clipboard: ${error.message}`);
        }
    }

    set commands(newCommands) {
        this.#$output.innerText = newCommands.join(" && ");
    }
}