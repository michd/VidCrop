(function(global) {

const ObservableEmitter = global.core.ObservableEmitter,
      shouldProcessBubbledKeyEvent = global.util.shouldProcessBubbledKeyEvent;

global.PlaybackControlView = class {
    #$playPauseButton;
    #$muteButton;

    #playPauseEmitter;
    #muteEmitter;

    constructor($container) {
        this.#$playPauseButton = $container.querySelector("#play_pause_button");
        this.#$muteButton = $container.querySelector("#mute_button");

        this.#playPauseEmitter = new ObservableEmitter();
        this.#muteEmitter = new ObservableEmitter();

        this.#$playPauseButton.addEventListener("click", () => this.#playPauseEmitter.emit());
        this.#$muteButton.addEventListener("click", () => this.#muteEmitter.emit());

        this.#setupKeyboardListeners();
    }

    #setupKeyboardListeners() {
        document.body.addEventListener("keydown", e => {
            if (!shouldProcessBubbledKeyEvent(e)) return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    this.#playPauseEmitter.emit();
                    break;

                case "m":
                    this.#muteEmitter.emit();
                    break;
            }
        });
    }

    set isPlaying(playing) {
        this.#$playPauseButton.classList.toggle("active", playing);
    }

    set isMuted(muted) {
        this.#$muteButton.classList.toggle("active", muted);
    }

    get playPauseButtonClick() { return this.#playPauseEmitter.asReadOnly(); }
    get muteButtonClick() { return this.#muteEmitter.asReadOnly(); }
};

}(window));