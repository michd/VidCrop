import VideoModel from "./video_model.js";
import VideoView from "./video_view.js";
import FilePickerView from "./file_picker_view.js";
import PlaybackControlView from "./playback_control_view.js";
import TimeRangeController from "./time_range_controller.js";
import CropController from "./crop_controller.js";
import OptionsController from "./options_controller.js";
import { CommandGenerator } from "./command_generator.js";
import { CommandCopyController } from "./command_copy_controller.js";
import FFmpegController from "./ffmpeg_controller.js";

const HIDDEN_CLASS = "hidden";

export default class App {
    #$loader;
    #$editor;
    #videoModel = new VideoModel();
    #filePickerView;
    #videoView;
    #playbackControlView;
    #timeRangeController;
    #cropController;
    #optionsController;
    #commandCopyController;
    #ffmpegController;

    constructor($filePicker, $loader, $editor) {
        this.#$loader = $loader;
        this.#$editor = $editor;
        this.#filePickerView = new FilePickerView($filePicker);
        this.#videoView = new VideoView($editor.querySelector("video"));
        this.#playbackControlView = new PlaybackControlView($editor.querySelector("#playback_control"));
        this.#timeRangeController = new TimeRangeController($editor.querySelector("#time_range_control"));
        this.#cropController = new CropController($editor.querySelector("#crop_editor"));
        this.#optionsController = new OptionsController($editor.querySelector("#options_control"));
        this.#commandCopyController = new CommandCopyController($editor.querySelector("#copyable_output"));
        this.#ffmpegController = new FFmpegController($editor.querySelector("#generator_control"));
    }

    bootstrap() {
        const videoModel = this.#videoModel,
              videoView = this.#videoView,
              playbackControlView = this.#playbackControlView,
              timeRangeController = this.#timeRangeController,
              cropController = this.#cropController,
              optionsController = this.#optionsController;

        let selectedFile = null;

        this.#filePickerView.selectedFile.subscribe(file => {
            if (file === selectedFile) return;

            if (selectedFile !== null && this.#videoModel.isModified) {
                if (!window.confirm("You've made changes to the currently loaded file. Load new file?")) {
                    this.#filePickerView.selectedFile = selectedFile;
                    return;
                }
            }

            selectedFile = file;

            this.#$editor.classList.add(HIDDEN_CLASS);
            this.#$loader.classList.remove(HIDDEN_CLASS);
            videoModel.clear();
            videoView.source = URL.createObjectURL(file);
        });

        // # videoView events
        videoView.loadedMetadata.subscribe(() => {
            videoModel.properties = new VideoModel.VideoProperties(
                selectedFile.name,
                videoView.videoSize.value,
                videoView.videoDurationMs.value
            );

            this.#$editor.classList.remove(HIDDEN_CLASS);
            this.#$loader.classList.add(HIDDEN_CLASS);
        });

        videoView.error.subscribe(errMsg => {
            if (videoModel.filename.value === null) {
                selectedFile = null;
                this.#$loader.classList.add(HIDDEN_CLASS);
                this.#filePickerView.displayError(errMsg);
            }
        });

        videoView.playing.subscribe(playing => playbackControlView.isPlaying = playing);
        videoView.muted.subscribe(muted => playbackControlView.isMuted = muted);
        videoView.currentTimeMs.subscribe(timeMs => timeRangeController.currentTimeMs = timeMs);
        videoView.preview.subscribe(preview => cropController.preview = preview);

        // # playerControlView events
        playbackControlView.playPauseButtonClick.subscribe(videoView.togglePlayPause.bind(videoView));
        playbackControlView.muteButtonClick.subscribe(videoView.toggleMute.bind(videoView));

        // #timeRangeController events
        timeRangeController.currentTimeMsPicked.subscribe(newTimeMs => videoView.currentTimeMs = newTimeMs);
        timeRangeController.startTimeMsPicked.subscribe(newStartTimeMs => videoModel.startTimeMs = newStartTimeMs);
        timeRangeController.endTimeMsPicked.subscribe(newEndTimeMs => videoModel.endTimeMs = newEndTimeMs);
        timeRangeController.rangeStartMsPicked.subscribe(newRangeStartMs => videoModel.spanStartMs = newRangeStartMs);
        timeRangeController.previewSelect.subscribe(videoView.selectPreview.bind(videoView));

        // #cropController events
        cropController.cropResize.subscribe(ratioCrop => {
            videoModel.updateCrop(ratioCrop, false);
        });

        cropController.cropMove.subscribe(ratioCrop => {
            videoModel.updateCrop(ratioCrop, true);
        });

        // #videoModel events
        videoModel.durationMs.subscribe(durationMs => timeRangeController.durationMs = durationMs);
        videoModel.trim.subscribe(newTrim => {
            videoView.loopTimeRange = newTrim;
            timeRangeController.timespan = newTrim;
            optionsController.timeRange = newTrim;
        });

        videoModel.filename.subscribe(filename => optionsController.sourceFilename = filename);

        videoModel.crop.subscribe(newCrop => {
            cropController.crop = newCrop.toRatioRect(videoModel.size.value);
            cropController.updateDisplayCrop(newCrop, videoModel.size.value);
            optionsController.crop = newCrop;
        });

        // #optionsController events
        optionsController.commandOptions.subscribe(options => {
            const commands = CommandGenerator.buildCommands(options);
            this.#commandCopyController.commands = commands;
            this.#ffmpegController.setFileData(selectedFile, options.inputFilename, options.outputFilename);
            this.#ffmpegController.commands = commands;
        });

        // Use escape keys to defocus an input element to let keyboard shortcuts work
        document.addEventListener("keydown", e => {
            if (e.key !== "Escape") return;

            const controlsToEscapeFrom = [ "INPUT", "TEXTAREA", "BUTTON", "SUMMARY" ];

            if (controlsToEscapeFrom.indexOf(e.target.tagName) !== -1) {
                document.body.focus();
            }
        });
    }
}