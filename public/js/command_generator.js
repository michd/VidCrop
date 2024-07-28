import {
    FFmpegCommand,
    FileCommand,
    OUTPUT_FORMAT
} from "./core.js";

export class CommandOptions {
    inputFilename;
    outputFilename;
    outputFormat;
    crop;
    scale;
    timeRange;
}

export class CommandGenerator {
    static get FFMPEG_GIF_PALETTE_FILTER() {
        return "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse";
    }

    static #buildCropFFmpegFilter(crop) {
        if (!crop) return "";
        return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
    }

    static #buildScaleFFmpegFilter(scale) {
        if (!scale) return "";
        return `scale=${scale.width}x${scale.height}:flags=lanczos`;
    }

    static #buildTrimCropScaleCommand(options, outputFilenameOverride) {
        const outputFilename = outputFilenameOverride ?? options.outputFilename;

        const cmd = new FFmpegCommand();
        cmd.inputFilename = options.inputFilename;
        cmd.outputFilename = outputFilename;
        cmd.trim = options.timeRange;
        cmd.filterGraph = `${this.#buildCropFFmpegFilter(options.crop)},` +
            `${this.#buildScaleFFmpegFilter(options.scale)}`;

        return cmd;
    }

    static #buildGifConversionCommand(inputFilename, outputFilename) {
        const cmd = new FFmpegCommand();
        cmd.inputFilename = inputFilename;
        cmd.outputFilename = outputFilename;
        cmd.filterGraph = CommandGenerator.FFMPEG_GIF_PALETTE_FILTER;
        cmd.additionalArgs = ["-loop", "0"];
        return cmd;
    }

    static #buildGifCommands(options) {
        const intermediateFilename = `tmp-${options.outputFilename}.mp4`;

        const preProcessCommand = CommandGenerator.#buildTrimCropScaleCommand(options, intermediateFilename);
        // Remove audio for intermediary file, save some useless processing
        preProcessCommand.additionalArgs = [ "-an" ];
        const gifCommand = CommandGenerator.#buildGifConversionCommand(intermediateFilename, options.outputFilename);
        const cleanupCommand = new FileCommand();
        cleanupCommand.baseCommand = "rm";
        cleanupCommand.args = [intermediateFilename];

        return [preProcessCommand, gifCommand, cleanupCommand];
    }

    static #buildMp4Commands(options) {
        return [CommandGenerator.#buildTrimCropScaleCommand(options)];
    }

    static buildCommands(commandOptions) {
        if (commandOptions.format === OUTPUT_FORMAT.GIF) {
            return CommandGenerator.#buildGifCommands(commandOptions);
        } else {
            return CommandGenerator.#buildMp4Commands(commandOptions);
        }
    }
}

export default {
    CommandOptions, CommandGenerator
};