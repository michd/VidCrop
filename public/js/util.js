(function (global) {

function lazy(producer) {
    if (typeof producer !== "function") {
        throw Error(`core.lazy: producer should be a function but is ${typeof producer}`);
    }

    let value;
    let valueProduced = false;

    return function() {
        if (valueProduced) return value;
        value = producer();
        valueProduced = true;
        return value;
    };
}

function delayMs(timeMs) {
    return new Promise(resolve => setTimeout(resolve, timeMs));
}

function constrainNumber(input, min, max) {
    if (typeof input !== "number") {
        throw new Error(`constrainNumber: input must be number but is ${typeof input}`);
    }
    if (typeof min !== "number") {
        throw new Error(`constrainNumber: min must be number but is ${typeof min}`);
    }
    if (typeof max !== "number") {
        throw new Error(`constrainNumber: max must be number but is ${typeof max}`);
    }

    return Math.max(min, Math.min(max, input))
}

function shouldProcessBubbledKeyEvent(e) {
    const IGNORE_TARGETS_SPACE_ENTER = [ "INPUT", "TEXTAREA", "BUTTON", "SUMMARY" ];
    const IGNORE_TARGETS_GENERAL = [ "INPUT", "TEXTAREA", "SELECT" ]; 
    const targetTagName = e.target.tagName;

    switch (e.key) {
        case "Enter":
        case " ":
            return IGNORE_TARGETS_SPACE_ENTER.indexOf(targetTagName) === -1;

        default:
            return IGNORE_TARGETS_GENERAL.indexOf(targetTagName) === -1;
    }
}

global.util = {
    lazy: lazy,
    delayMs: delayMs,
    constrainNumber,
    shouldProcessBubbledKeyEvent: shouldProcessBubbledKeyEvent
};

}(window));