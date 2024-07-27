import { FFmpeg } from "./ffmpeg/ffmpeg/package/dist/esm/index.js"; // Needs SharedArrayBuffer
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
//import  FFmpeg  from "./ffmpeg/ffmpeg/package/dist/umd/ffmpeg.js";
import { fetchFile } from "./ffmpeg/util/package/dist/esm/index.js"; // Needs SharedArrayBuffer
//import { fetchFile } from "./ffmpeg/util/package/dist/umd/index.js";
import {
    Logger,
    ObservableProperty,
    ObservableEmitter,
    FFmpegCommand,
    FileCommand
} from "./core.js"

const FFMPEG_CORE_URL = "/js/ffmpeg/core-mt/package/dist/esm/ffmpeg-core.js" // Needs SharedArrayBuffer
//const FFMPEG_CORE_URL = "/js/ffmpeg/core/package/dist/umd/ffmpeg-core.js"

// TODO more elaborate status reporting
export default class FFmpegController {
    
    #ffmpeg;
    #logger = new Logger("FFmpegController");
    #initializing = false;
    #initialized = false;

    #outputBlob = new ObservableProperty(null);
    #progress = new ObservableEmitter();

    async init() {
        if (this.#initialized || this.#initializing) return;
        this.#initializing = true;
        this.#ffmpeg = new FFmpeg();
        this.#ffmpeg.on("log", ({ message }) => this.#ffmpegOnLog(message));
        this.#ffmpeg.on("progress", ({ progress }) => this.#ffmpegOnProgress(progress));
        await this.#ffmpeg.load({ coreURL: FFMPEG_CORE_URL });
        this.#initializing = false;
        this.#initialized = true;
    }

    #ffmpegOnLog(message) {
        this.#logger.log(message);           
    }

    #ffmpegOnProgress(progress) {
        this.#progress.emit(progress * 100); 
    }

    async #runFFmpegCommand(cmd) {
        console.log("about to run ffmpeg command with args", cmd.argsArray);
        await this.#ffmpeg.exec(cmd.argsArray);
    }

    async #runFileCommand(cmd) {
        switch (cmd.baseCommand) {
            case "rm":
                await this.#ffmpeg.deleteFile(cmd.args[0]);
                break;
        }
    }

    async runCommands(inputFile, outputFilename, commands) {
        if (!this.#initialized) {
            try {
                await this.init();
            } catch (err) {
                console.error("runCommands init", err);
            }
        }

        const firstCmd = commands[0];

        if (firstCmd instanceof FFmpegCommand) {
            const inputFilename = firstCmd.argsArray[1];
            try {
                await this.#ffmpeg.writeFile(inputFilename, await fetchFile(inputFile));
            } catch (err) {
                console.error("runCommands 2", err, "fname", inputFilename, "inputFile", inputFile);
            }
        }

        for (let i = 0; i < commands.length; i++) {
            let cmd = commands[i];

            if (cmd instanceof FFmpegCommand) {
                try {
                    await this.#runFFmpegCommand(cmd);
                } catch (err) {
                    console.error("runCommands 3 index", i, "cmd", cmd, err);
                }
            } else if (cmd instanceof FileCommand) {
                try {
                    await this.#runFileCommand(cmd)
                } catch (err) {
                    console.error("runCommands 4 index", i, "cmd", cmd, err);
                }
            }
        }

        const outputFileExt = outputFilename.split(".").pop().toLowerCase();
        const mime = (outputFileExt === "gif") ? "image/gif" : "video/mp4";
        try {
            const outData = await this.#ffmpeg.readFile(outputFilename);
            this.#outputBlob.value = new Blob([outData.buffer], { type: mime });
        } catch (err) {
            console.error("runCommands 5", err);
        }
    }

    get outputBlob() { return this.#outputBlob.asReadOnly(); }
    get progress() { return this.#progress.asReadOnly(); }
}