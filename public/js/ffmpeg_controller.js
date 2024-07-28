import { FFmpeg } from "./ffmpeg/ffmpeg/package/dist/esm/index.js";
import { fetchFile } from "./ffmpeg/util/package/dist/esm/index.js";
import {
    Logger,
    ObservableEmitter,
    FFmpegCommand,
    FileCommand
} from "./core.js"

const FFMPEG_CORE_URL = "/js/ffmpeg/core-mt/package/dist/esm/ffmpeg-core.js";

const HIDDEN_CLASS = "hidden";

class FFmpegWrapper {
    #ffmpeg;
    #logger = new Logger("FFmpegWrapper");
    #initializing = false;
    #initialized = false;

    #progress = new ObservableEmitter();
    #status = new ObservableEmitter();

    #statusSteps = null;

    async #init() {
        if (this.#initialized || this.#initializing) return;
        this.#writeStatus("Initializing FFmpeg...");
        this.#initializing = true;
        this.#ffmpeg = new FFmpeg();
        this.#ffmpeg.on("log", this.#ffmpegOnLog.bind(this));
        this.#ffmpeg.on("progress", this.#ffmpegOnProgress.bind(this));
        await this.#ffmpeg.load({ coreURL: FFMPEG_CORE_URL });
        this.#initialized = true;
        this.#initializing = false;
        this.#writeStatus("FFmpeg initialized.");
    }

    #writeStatus(message) {
        if (this.#statusSteps) {
            message = `(${this.#statusSteps.step}/${this.#statusSteps.total}) ${message}`;
        }

        this.#logger.log(message);
        this.#status.emit(message);
    }

    #ffmpegOnLog({ message }) {
        this.#writeStatus(message);
    }

    #ffmpegOnProgress({ progress }) {
        if (progress > 1) {
            return;
        };

        const steps = this.#statusSteps;
        let adaptedProgress = progress;

        if (steps) {
            const divisor = steps.total;
            const baseProgress = (steps.step - 1) * (1 / divisor);
            adaptedProgress = baseProgress + (progress / divisor);
        }

        this.#progress.emit(adaptedProgress * 100);
    }

    async #runFFmpegCommand(cmd) {
        await this.#ffmpeg.exec(cmd.args);
    }

    async #runFileCommand(cmd) {
        await this.#init();

        switch (cmd.baseCommand) {
            // TODO not a magic string preferrably
            case "rm":
                await this.#ffmpeg.deleteFile(cmd.args[0]);
                this.#writeStatus(`Deleted internal file "${cmd.args[0]}"`);
                break;
        }
    }

    async runCommands(commands) {
        await this.#init();

        const ffmpegCommandCount = commands.filter(c => c instanceof FFmpegCommand).length;

        if (ffmpegCommandCount > 1) {
            this.#statusSteps = { step: 1, total: ffmpegCommandCount };
        } else {
            this.#statusSteps = null;
        }

        this.#progress.emit(null);

        for (let i = 0; i < commands.length; i++) {
            let cmd = commands[i];

            if (cmd instanceof FFmpegCommand) {
                await this.#runFFmpegCommand(cmd);

                if (this.#statusSteps) {
                    this.#statusSteps.step = Math.min(this.#statusSteps.step + 1, this.#statusSteps.total);
                }
            } else if (cmd instanceof FileCommand) {
                await this.#runFileCommand(cmd)
            }
        }

        this.#statusSteps = null;
    }

    async putFile(file, filename) {
        await this.#init();
        await this.#ffmpeg.writeFile(filename, await fetchFile(file));
        this.#writeStatus(`Imported file "${filename}"`);
    }

    async getFileAsBlob(filename) {
        await this.#init();
        const fileExt = filename.split(".").pop().toLowerCase();
        const mime = (fileExt === "gif") ? "image/gif" : "video/mp4";
        try {
            const outData = await this.#ffmpeg.readFile(filename);
            this.#writeStatus(`Exported file "${filename}"`);
            return new Blob([outData.buffer], { type: mime });
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    async deleteFiles(filenames) {
        await this.#init();
        for (let i = 0; i < filenames.length; i++) {
            await this.#ffmpeg.deleteFile(filenames[i]);
            this.#writeStatus(`Deleted internal file "${filenames[i]}"`);
        }
    }

    get progress() { return this.#progress.asReadOnly(); }
    get status() { return this.#status.asReadOnly(); }

}

export default class FFmpegController {
    #$runButton;
    #$progress;
    #$saveInstructions;
    #$saveLink;
    #$statusSummaryOutput;
    #$statusOutput;

    #ffmpegWrapper;

    #inputFile = null;
    #inputFilename = null;
    #outputFilename = null;
    #commands = null;

    #objectURL;
    #isRunning;

    constructor($container) {
        this.#$runButton = $container.querySelector("button.run");
        this.#$progress = $container.querySelector("progress");
        this.#$saveInstructions = $container.querySelector("p.save_instructions");
        this.#$saveLink = $container.querySelector("a.save");
        this.#$statusSummaryOutput = $container.querySelector("summary output");
        this.#$statusOutput = $container.querySelector("pre.status_log");

        this.#ffmpegWrapper = new FFmpegWrapper();
        this.#ffmpegWrapper.progress.subscribe(this.#onProgress.bind(this));
        this.#ffmpegWrapper.status.subscribe(this.#onStatusUpdate.bind(this));

        this.#$runButton.addEventListener("click", this.#onRunClicked.bind(this));
    }

    async #onRunClicked() {
        this.#clearStatus();

        const inputFile = this.#inputFile,
              inputFilename = this.#inputFilename,
              outputFilename = this.#outputFilename;

        if (!this.#commands) {
            console.error("run: missing commands to run.");
            return;
        }

        if (!inputFile) {
            console.error("run: missing input file.");
            return;
        }

        if (!inputFilename) {
            console.error("run: missing input filename.");
            return;
        }

        if (!outputFilename) {
            console.error("run: missing output filename.");
            return;
        }

        this.#$runButton.disabled = true;
        this.#isRunning = true;

        try {
            this.#clearObjectUrl();
            await this.#ffmpegWrapper.putFile(inputFile, inputFilename);
            await this.#ffmpegWrapper.runCommands(this.#commands);
            const outputBlob = await this.#ffmpegWrapper.getFileAsBlob(outputFilename);
            await this.#ffmpegWrapper.deleteFiles([inputFilename, outputFilename]);
            this.#onStatusUpdate("Done.")
            this.#objectURL = URL.createObjectURL(outputBlob);
            this.#$saveLink.href = this.#objectURL;
            this.#$saveLink.download = outputFilename;
            this.#$saveLink.click();
            this.#$saveInstructions.classList.remove(HIDDEN_CLASS);
            this.#isRunning = false;
        } catch (err) {
            this.#isRunning = false;
            this.#onStatusUpdate(`Something went wrong. ${err.message}`);
            this.#$runButton.disabled = false;
        }
    }

    #onProgress(progressPct) {
        const $p = this.#$progress;

        console.log("onprogress", progressPct);

        if (progressPct === null) {
            $p.removeAttribute("value");
        } else {
            $p.value = progressPct;
        }
    }

    #onStatusUpdate(msg) {
        this.#$statusSummaryOutput.textContent = msg;
        this.#$statusOutput.textContent += `${msg}\n`;
    }

    #clearObjectUrl() {
        if (this.#objectURL) {
            URL.revokeObjectURL(this.#objectURL);
            this.#objectURL = null;
            this.#$saveLink.href = "";
            this.#$saveInstructions.classList.add(HIDDEN_CLASS);
        }
    }

    #clearStatus() {
        this.#$statusSummaryOutput.textContent = "";
        this.#$statusOutput.textContent = "";
    }

    setFileData(inputFile, inputFilename, outputFilename) {
        this.#inputFile = inputFile;
        this.#inputFilename = inputFilename;
        this.#outputFilename = outputFilename;
    }

    set commands(newCommands) {
        this.#commands = newCommands;

        if (!this.#isRunning) {
            this.#$runButton.disabled = false;
        }
    }
}