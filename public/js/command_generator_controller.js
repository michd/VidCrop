(function (global) {

const ObservableEmitter = global.core.ObservableEmitter,
      ObservableProperty = global.core.ObservableProperty,
      Size = global.core.Size,
      delayMs = global.util.delayMs;

const FORMAT_GIF = "GIF",
      FORMAT_MP4 = "MP4";

const FORMATS = [FORMAT_GIF, FORMAT_MP4];

const COPY_SUCCESS_CLASS = "copy_success";

class CommandOptions {
    inputFilename;
    outputFilename;
    outputFormat;
    crop;
    scale;
    timeRange;
}

class CommandGenerator {
    static get FFMPEG_GIF_PALETTE_FILTER() { 
        return "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse";
    }

    static #buildTimeRangeFFmpegArg(timeRange) {
        if (!timeRange) return "";

        const startS = timeRange.startTimeMs / 1000,
              durationS = timeRange.durationMs / 1000;

        return `-ss ${startS} -t ${durationS}`;
    }

    static #buildCropFFmpegFilter(crop) {
        if (!crop) return "";
        return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
    }

    static #buildScaleFFmpegFilter(scale) {
        if (!scale) return "";
        return `scale=${scale.width}x${scale.height}:flags=lanczos`;
    }

    static #buildTrimCropScaleFFmpegArgs(timeRange, crop, scale) {
        return `${CommandGenerator.#buildTimeRangeFFmpegArg(timeRange)} ` +
            ` -vf "${CommandGenerator.#buildCropFFmpegFilter(crop)},` +
                `${CommandGenerator.#buildScaleFFmpegFilter(scale)}"`;
    }

    static #buildTrimCropScaleCommand(options, outputFilenameOverride) {
        const outputFilename = outputFilenameOverride ?? options.outputFilename;
        const trimCropScaleArgs = CommandGenerator.#buildTrimCropScaleFFmpegArgs(
            options.timeRange,
            options.crop,
            options.scale
        );

        return `ffmpeg -i "${options.inputFilename}" ${trimCropScaleArgs} "${outputFilename}"`;
    }

    static #buildGifCommands(options) {
        const intermediateFilename = `tmp-${options.outputFilename}.mp4`;
        const preProcessCommand = CommandGenerator.#buildTrimCropScaleCommand(options, intermediateFilename);
        const gifCommand = `ffmpeg -i "${intermediateFilename}" -vf "${CommandGenerator.FFMPEG_GIF_PALETTE_FILTER}"` +
            ` -loop 0 "${options.outputFilename}"`;
        const cleanupCommand = `rm "${intermediateFilename}"`;

        return `${preProcessCommand} && ${gifCommand} && ${cleanupCommand}`;
    }

    static #buildMp4Command(options) {
        return CommandGenerator.#buildTrimCropScaleCommand(options);
    }

    static buildCommand(commandOptions) {
        if (commandOptions.format === FORMAT_GIF) {
            return CommandGenerator.#buildGifCommands(commandOptions);
        } else {
            return CommandGenerator.#buildMp4Command(commandOptions);
        }
    }
}

function attachChangeEmitter($el, emitter) {
    $el.addEventListener("change", () => emitter.emit($el.value));
}

class ScaleController {
    #$percentInput;
    #$widthInput;
    #$heightInput;
    #$summaryOutput;

    #percentChangeEmitter;
    #widthChangeEmitter;
    #heightChangeEmitter;

    constructor($details) {
        this.#$percentInput = $details.querySelector("input.scale_percent");
        this.#$percentInput.value = 100;
        this.#$widthInput = $details.querySelector("input.scale_width");
        this.#$heightInput = $details.querySelector("input.scale_height");
        this.#$summaryOutput = $details.querySelector("summary output");

        this.#percentChangeEmitter = new ObservableEmitter();
        this.#widthChangeEmitter = new ObservableEmitter();
        this.#heightChangeEmitter = new ObservableEmitter();

        attachChangeEmitter(this.#$percentInput, this.#percentChangeEmitter);
        attachChangeEmitter(this.#$widthInput, this.#widthChangeEmitter);
        attachChangeEmitter(this.#$heightInput, this.#heightChangeEmitter);
    }

    #updateSummaryOutput() {
        const percent = this.#$percentInput.value,
              width = this.#$widthInput.value,
              height = this.#$heightInput.value;

        this.#$summaryOutput.innerText = `${percent}% (${width}x${height})`;
    }

    set percent(v) { 
        this.#$percentInput.value = Math.round(v * 10) / 10;
        this.#updateSummaryOutput();
    }

    set height(v) {
        this.#$heightInput.value = v;
        this.#updateSummaryOutput();
    }

    set width(v) { 
        this.#$widthInput.value = v;
        this.#updateSummaryOutput();
    }

    get percentChange() { return this.#percentChangeEmitter.asReadOnly(); }
    get widthChange() { return this.#widthChangeEmitter.asReadOnly(); }
    get heightChange() { return this.#heightChangeEmitter.asReadOnly(); }
}

class FormatController {
    #$outputTypeSelect;
    #$summaryOutput;
    #formatProperty;

    constructor($details) {
        this.#$outputTypeSelect = $details.querySelector("select");
        this.#$summaryOutput = $details.querySelector("summary output");
        this.#formatProperty = new ObservableProperty(this.#$outputTypeSelect.value.toUpperCase());
        this.#$outputTypeSelect.addEventListener("change", this.#updateFormat.bind(this));
        this.#updateFormat();
    }

    #updateFormat() {
        const format = this.#$outputTypeSelect.value.toUpperCase();
        this.#formatProperty.value = format;
        this.#$summaryOutput.innerText = format;
    }

    get format() { return this.#formatProperty.asReadOnly(); }
}

class FileNamingController {
    #$inputFilenameInput;
    #$inputFilenameExtOutput;
    #$outputFilenameInput;
    #$outputFilenameExtOutput;
    #$inputResetButton;
    #$outputResetButton;
    #$summaryOutput;

    #inputFilenameProperty;
    #outputFilenameProperty;

    #defaultInputName;
    #defaultInputExt;
    #defaultOutputName;
    #defaultOutputExt;

    constructor($details) {
        this.#$inputFilenameInput = $details.querySelector("input.input_filename");
        this.#$inputFilenameInput.value = "";
        this.#$inputFilenameExtOutput = $details.querySelector("output.input_filename_ext");
        this.#$outputFilenameInput = $details.querySelector("input.output_filename");
        this.#$outputFilenameInput.value = "";
        this.#$outputFilenameExtOutput = $details.querySelector("output.output_filename_ext");
        this.#$inputResetButton = $details.querySelector("button.reset_input_filename_button");
        this.#$outputResetButton = $details.querySelector("button.reset_output_filename_button");
        this.#$summaryOutput = $details.querySelector("summary output");

        this.#inputFilenameProperty = new ObservableProperty("input.mp4");
        this.#outputFilenameProperty = new ObservableProperty("input.gif");

        this.#$inputFilenameInput.addEventListener("change", this.#onInputNameChange.bind(this));
        this.#$outputFilenameInput.addEventListener("change", this.#onOutputNameChange.bind(this));

        this.#$inputResetButton.addEventListener("click", this.#onInputNameReset.bind(this));
        this.#$outputResetButton.addEventListener("click", this.#onOutputNameReset.bind(this));
    }

    static #splitOffExt(name) {
        const parts = name.split(".");
        if (parts.length < 2) {
            return [name, ""];
        }

        const ext = parts.pop();
        return [parts.join("."), ext];
    }    

    #inputIsDefault() {
        const input = this.#$inputFilenameInput.value.trim();
        return input === this.#defaultInputName || input === "";
    }

    #outputIsDefault() {
        const input = this.#$outputFilenameInput.value.trim();
        return input === this.#defaultOutputName || input === "";
    }

    #updateSummaryOutput() {
        this.#$summaryOutput.innerHTML = `<br>input: <strong>${this.#inputFilenameProperty.value}</strong><br>` + 
            `output: <strong>${this.#outputFilenameProperty.value}</strong>`;
    }

    #onInputNameChange() {
        this.#inputFilenameProperty.value = `${this.#$inputFilenameInput.value}.${this.#defaultInputExt}`;
        this.#updateSummaryOutput();
    }

    #onOutputNameChange() {
        this.#outputFilenameProperty.value = `${this.#$outputFilenameInput.value}.${this.#defaultOutputExt}`;
        this.#updateSummaryOutput();
    }

    #onInputNameReset() {
        this.#$inputFilenameInput.value = this.#defaultInputName;
        this.#onInputNameChange();
    }

    #onOutputNameReset() {
        this.#$outputFilenameInput.value = this.#defaultOutputName;
        this.#onOutputNameChange();
    }

    set defaultInputFilename(newDefaultInputName) {
        const wasDefault = this.#inputIsDefault();

        const split = FileNamingController.#splitOffExt(newDefaultInputName);
        this.#defaultInputName = split[0];
        this.#defaultInputExt = split[1];
        this.#$inputFilenameExtOutput.innerText = `.${this.#defaultInputExt}`;

        if (wasDefault) {
            this.#$inputFilenameInput.value = this.#defaultInputName;
            this.#onInputNameChange();
        }
    }

    set defaultOutputFilename(newDefaultOutputName) {
        const wasDefault = this.#outputIsDefault();

        const split = FileNamingController.#splitOffExt(newDefaultOutputName);
        this.#defaultOutputName = split[0];
        this.#defaultOutputExt = split[1];
        this.#$outputFilenameExtOutput.innerText = `.${this.#defaultOutputExt}`;

        if (wasDefault) {
            this.#$outputFilenameInput.value = this.#defaultOutputName;
            this.#onOutputNameChange();
        }
    }

    get inputFilename() { return this.#inputFilenameProperty.asReadOnly(); }
    get outputFilename() { return this.#outputFilenameProperty.asReadOnly(); }
}

class CommandCopyController {
    #$output;

    constructor($container) {
        this.#$output = $container.querySelector("output");
        this.#$output.addEventListener("click", this.#onOutputClick.bind(this));
    }

    async #onOutputClick() {
        try {
            await navigator.clipboard.writeText(this.#$output.innerText);
            this.#$output.classList.add(COPY_SUCCESS_CLASS);
            await delayMs(1000);
            this.#$output.classList.remove(COPY_SUCCESS_CLASS);
        } catch(error) {
            console.error(`failed to copy to clipboard: ${error.message}`);
        }
    }

    set command(newCommand) {
        this.#$output.innerText = newCommand;
    }
}

global.CommandGeneratorController = class {
    #scaleController;
    #formatController;
    #fileNamingController;
    #commandCopyController;

    #scaleRatio = 1;
    #scaleSize;
    #format = FORMAT_GIF;
    #inputFilename = "input.mp4";
    #outputFilename = "input.gif";

    #cropRect;
    #timeRange;

    constructor($container) {
        this.#scaleController = new ScaleController($container.querySelector("details.scaling"));
        this.#formatController = new FormatController($container.querySelector("details.output_format"));
        this.#fileNamingController = new FileNamingController($container.querySelector("details.file_naming"));
        this.#commandCopyController = new CommandCopyController($container.querySelector("section.generator_output"));

        this.#scaleController.percentChange.subscribe(this.#onScalePercentChange.bind(this));
        this.#scaleController.widthChange.subscribe(this.#onScaleWidthChange.bind(this));
        this.#scaleController.heightChange.subscribe(this.#onScaleHeightChange.bind(this));

        this.#formatController.format.subscribe(this.#onFormatChange.bind(this));

        this.#fileNamingController.inputFilename.subscribe(this.#onInputFilenameChange.bind(this));
        this.#fileNamingController.outputFilename.subscribe(this.#onOutputFilenameChange.bind(this));
    }

    #onScalePercentChange(percent) {
        this.#scaleRatio = percent / 100;
        this.#calcScaleSize();
    }

    #onScaleWidthChange(width) {
        width = Math.round(width / 2) * 2;
        this.#scaleRatio = width / this.#cropRect.width;
        this.#scaleController.percent = this.#scaleRatio * 100;
        this.#calcScaleSize();
    }

    #onScaleHeightChange(height) {
        height = Math.round(height / 2) * 2;
        this.#scaleRatio = height / this.#cropRect.height;
        this.#scaleController.percent = this.#scaleRatio * 100;
        this.#calcScaleSize();
    }

    #onFormatChange(format) {
        if (FORMATS.indexOf(format) === -1) return;
        this.#format = format;
        this.#updateDefaultOutputFilename();
        this.#generateCommand();
    }

    #calcScaleSize() {
        this.#scaleSize = new Size(
            Math.round((this.#cropRect.width * this.#scaleRatio) / 2) * 2,
            Math.round(this.#cropRect.height * this.#scaleRatio / 2) * 2
        );

        this.#scaleController.width = this.#scaleSize.width;
        this.#scaleController.height = this.#scaleSize.height;
        this.#updateDefaultOutputFilename();
        this.#generateCommand();
    }

    #updateDefaultOutputFilename() {
        function formatTime(timeMs) {
            let remaining = timeMs;

            const HOUR_MS = 1000 * 60 * 60,
                  MIN_MS = 1000 * 60,
                  SEC_MS = 1000;
            
            const hours = (remaining >= HOUR_MS) ? Math.floor(remaining / HOUR_MS) : 0;
            if (hours > 0) remaining -= (hours * HOUR_MS);
            const mins = (remaining >= MIN_MS) ? Math.floor(remaining / MIN_MS) : 0;
            if (mins > 0) remaining -= (mins * MIN_MS);
            const secs = (remaining >= SEC_MS) ? Math.floor(remaining / SEC_MS) : 0;
            if (secs > 0) remaining -= (secs * SEC_MS);
            const ms = remaining;

            return `${hours > 0 ? `${hours}h` : ""}` +
                `${mins > 0 ? `${mins}m` : "" }` +
                `${secs > 0 ? `${secs}s` : "" }` +
                `${(ms > 0 || hours != 0 || mins != 0 || secs != 0 || (hours + mins + secs === 0)) ? `${ms}ms` : ""}`;
        }

        const parts = this.#inputFilename.split("."),
              ext = this.#format.toLowerCase();              

        parts.pop();

        const baseName = parts.join("."),
              cropPosStr = this.#cropRect ? `crop-x${this.#cropRect.x}y${this.#cropRect.y}` : "",
              cropSizeStr = this.#cropRect ? `${this.#cropRect.width}x${this.#cropRect.height}` : "",
              scaleStr = this.#scaleSize ? `scale-${this.#scaleSize.width}x${this.#scaleSize.height}` : "",
              timeRangeStr = this.#timeRange ? `time-${formatTime(this.#timeRange.startTimeMs)}-` + 
                `${formatTime(this.#timeRange.endTimeMs)}` : "",
              defaultOutFilename = `${baseName}--${cropPosStr}-${cropSizeStr}--${scaleStr}--${timeRangeStr}.${ext}`;


        this.#fileNamingController.defaultOutputFilename = defaultOutFilename;
    }

    #onInputFilenameChange(newInputFilename) {
        this.#inputFilename = newInputFilename;
        this.#updateDefaultOutputFilename();
        this.#generateCommand();
    }

    #onOutputFilenameChange(newOutputFilename) {
        this.#outputFilename = newOutputFilename;
        this.#generateCommand();
    }


    #generateCommand() {
        const options = new CommandOptions();
        options.inputFilename =  this.#inputFilename;
        options.outputFilename = this.#outputFilename;
        options.format = this.#format;
        options.crop = this.#cropRect;
        options.scale = this.#scaleSize;
        options.timeRange = this.#timeRange;

        this.#commandCopyController.command = CommandGenerator.buildCommand(options);
    }

    set sourceFilename(defaultInputFilename) {
        this.#fileNamingController.defaultInputFilename = defaultInputFilename ?? "input.mp4";
    }

    set crop(cropRect) {
        this.#cropRect = cropRect;
        this.#calcScaleSize();
        this.#updateDefaultOutputFilename();
        this.#generateCommand();
    }

    set timeRange(newTimeRange) {
        this.#timeRange = newTimeRange;
        this.#updateDefaultOutputFilename();
        this.#generateCommand();
    }
};

}(window));