(function(global) {

const VideoModel = global.VideoModel,
      VideoView = global.VideoView,
      FilePickerView = global.FilePickerView,
      PlaybackControlView = global.PlaybackControlView,
      TimeRangeController = global.TimeRangeController,
      CropController = global.CropController,
      CommandGeneratorController = global.CommandGeneratorController;

const HIDDEN_CLASS = "hidden";

global.App = class {
    #$loader;
    #$editor;
    #videoModel = new VideoModel();
    #filePickerView;
    #videoView;    
    #playbackControlView;
    #timeRangeController;
    #cropController;
    #commandGeneratorController;

    constructor($filePicker, $loader, $editor) {
        this.#$loader = $loader;
        this.#$editor = $editor;
        this.#filePickerView = new FilePickerView($filePicker);
        this.#videoView = new VideoView($editor.querySelector("video"));
        this.#playbackControlView = new PlaybackControlView($editor.querySelector("#playback_control"));
        this.#timeRangeController = new TimeRangeController($editor.querySelector("#time_range_control"));
        this.#cropController = new CropController($editor.querySelector("#crop_editor"));
        this.#commandGeneratorController = new CommandGeneratorController($editor.querySelector("#command_generator"));
    }

    bootstrap() {
        const videoModel = this.#videoModel,
              videoView = this.#videoView,
              playbackControlView = this.#playbackControlView,
              timeRangeController = this.#timeRangeController,
              cropController = this.#cropController,
              commandGeneratorController = this.#commandGeneratorController;

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
            commandGeneratorController.timeRange = newTrim;
        });

        videoModel.filename.subscribe(filename => commandGeneratorController.sourceFilename = filename);

        videoModel.crop.subscribe(newCrop => {
            cropController.crop = newCrop.toRatioRect(videoModel.size.value);
            cropController.updateDisplayCrop(newCrop, videoModel.size.value);
            commandGeneratorController.crop = newCrop;
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

}(window));