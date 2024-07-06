(function (global) {


const ObservableProperty = global.core.ObservableProperty;

const EMPTY_CLASS = "empty",
      HIDDEN_CLASS = "hidden",
      ERROR_CLASS = "error";

const EXPECTED_TYPE = "video";


function formatSizeDecimal(sizeB) {
    if (sizeB < 1000) return `${sizeB} B`;
    const sizeKB = Math.round((sizeB / 1000) * 10) / 10;
    if (sizeKB < 1000) return `${sizeKB} kB`;
    const sizeMB = Math.round((sizeKB / 1000) * 10) / 10;
    if (sizeMB < 1000) return `${sizeMB} MB`;
    const sizeGB = Math.round((sizeMB / 1000) * 10) / 10;
    return `${sizeGB} GB`;
}

// Shoutout to https://css-tricks.com/snippets/javascript/test-if-dragenterdragover-event-contains-files/
function isFileDragEvent(e) {
    const types = e?.dataTransfer?.types;

    if (!types) return false;

    for (let i = 0; i < types.length; i++) {
        if (types[i] === "Files") return true;
    }

    return false;
}

global.FilePickerView = class {
    #$container;
    #$fileInput;
    #$fileStatusOutput;

    #$dropHelper;
    #$dropZone;

    #selectedFile = new ObservableProperty(null);

    constructor($container) {
        this.#$container = $container;
        this.#$fileInput = $container.querySelector("input[type=file]");
        this.#$fileInput.value = null;
        this.#$fileStatusOutput = $container.querySelector("output");
        this.#$dropHelper = $container.querySelector(".drop_helper");
        this.#$dropZone = $container.querySelector(".drop_zone");

        this.#$fileInput.addEventListener("change", this.#onFileInputChange.bind(this));
        this.#setupDragDrop();
    }


    #clearError() {
        this.#$container.classList.remove(ERROR_CLASS);
        this.#$fileStatusOutput.textContent = "";
    }

    #onFileSelected(files) {
        this.#clearError();

        if (files.length > 1) {
            this.displayError(`Please only select a single file of type "${EXPECTED_TYPE}"`);
            return;
        }

        if (files.length === 0) return;

        const file = files[0],
              fileType = file.type.split("/")[0];

        if (fileType !== EXPECTED_TYPE) {
            this.displayError(
                `Error: only files of type "${EXPECTED_TYPE}" are allowed, "${file.name}" is "${file.type}".`
            );
            return;
        }

        this.#$fileStatusOutput.textContent = `${file.name} (${formatSizeDecimal(file.size)})`;
        this.#selectedFile.value = file;
        this.#$container.classList.remove(EMPTY_CLASS);
    }

    #onFileInputChange() {
        this.#onFileSelected(this.#$fileInput.files);
        return;
    }

    #setupDragDrop() {
        const $dz = this.#$dropZone;

        document.ondragover = this.#onDragOver.bind(this);
        $dz.ondragover = () => false;
        $dz.ondragend = this.#onDragEnd.bind(this);
        $dz.ondragleave = this.#onDragEnd.bind(this);
        $dz.ondrop = this.#onDrop.bind(this);
        document.ondrop = this.#onDrop.bind(this);
    }

    #onDragOver(e) {
        if (!isFileDragEvent(e)) return false;

        this.#$dropHelper.classList.remove(HIDDEN_CLASS);
        this.#$dropZone.ondragover();

        // Unbind these handlers since we now have an overlay receiving the events
        // this overlay prevents additional events being triggered as the mouse hovers various
        // elements of the page
        document.ondragover = null;
        document.ondrop = null;
        return false;
    }

    #onDragEnd(e) {
        this.#$dropHelper.classList.add(HIDDEN_CLASS);
        document.ondragover = this.#onDragOver.bind(this);
        return false;
    }

    #onDrop(e) {
        if (!isFileDragEvent(e)) return false;
        e.preventDefault();
        this.#onFileSelected(e.dataTransfer.files);
        this.#onDragEnd();
        return false;
    }

    clear() {
        this.#selectedFile.value = null;
        this.#clearError();
    }

    displayError(msg) {
        this.#$container.classList.add(ERROR_CLASS);
        this.#$fileStatusOutput.textContent = msg;
    }

    get selectedFile() {
        return this.#selectedFile.asReadOnly();
    }

    set selectedFile(newSelectedFile) {
        this.#onFileSelected([newSelectedFile]);
    }
}

}(window));