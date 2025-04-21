// ───── DOM Elements ─────
const btnConnectMicrobit = document.getElementById("btnConnectMicrobit");
const btnDisconnectMicrobit = document.getElementById("btnDisconnectMicrobit");
const btnLoadModal = document.getElementById("btnLoadModal");
const modelUrlInput = document.getElementById("modelUrlInput");
const imageUpload = document.getElementById("imageUpload");
const modeSelect = document.getElementById("modeSelect");
const labelContainer = document.getElementById("label-container");
const loadingSpinner = document.getElementById("loading-spinner");

// ───── Global Variables ─────
let modelURLPrefix = "";
let model, maxPredictions;
let port, writer;
let webcam, mode = "upload";

// ───── Initial Setup ─────
window.addEventListener("load", () => {
    disableInteraction(); 
    getModelURL().catch(() => { });
});

window.addEventListener("beforeunload", async () => {
    if (webcam) {
        try {
            await webcam.stop();
        } catch (error) {
            console.error("Error stopping webcam on unload:", error);
        }
    }
});

// ───── Event Listeners ─────
btnConnectMicrobit?.addEventListener('click', connectMicrobit);
btnDisconnectMicrobit?.addEventListener('click', disconnectMicrobit);
btnLoadModal?.addEventListener('click', loadModelFromInput);

imageUpload?.addEventListener("change", async (event) => {
    const imageElement = document.getElementById("uploadedImage");
    imageElement.src = '';
    imageElement.classList.remove('show');  
    imageElement.style.display = 'none';
    labelContainer.innerHTML = '';
    loadingSpinner.style.display = 'flex';

    setTimeout(async () => {
        const file = event.target.files[0];
        if (file) {
            imageElement.src = URL.createObjectURL(file);
            
            imageElement.style.display = 'block';
            setTimeout(() => {
                imageElement.classList.remove('show');
                void imageElement.offsetWidth;
                imageElement.classList.add('show');
            }, 50);

            imageElement.onload = async () => {
                try {
                    await predictImage(imageElement);
                } finally {
                    loadingSpinner.style.display = 'none';
                }
            };
        }
    }, 500);
});

modeSelect?.addEventListener("change", async (e) => {
    mode = e.target.value;
    if (mode === "upload") {
        document.getElementById("uploadSection").style.display = "block";
        document.getElementById("webcam-container").style.display = "none";

        if (webcam) {
            try {
                await webcam.stop();
                webcam = null;
            } catch (error) {
                console.error("Error stopping webcam:", error);
            }
        }
    } else {
        document.getElementById("uploadSection").style.display = "none";
        document.getElementById("webcam-container").style.display = "block";
        await startWebcam();
    }
});

modelUrlInput?.addEventListener("input", () => {
    const trimmed = modelUrlInput.value.trim();
    if (!trimmed) {
        disableInteraction();
    }
});

// ───── Model Loading ─────
async function getModelURL() {
    const { value: modelURL } = await Swal.fire({
        title: 'Enter Model URL',
        input: 'text',
        inputLabel: 'Teachable Machine Model URL Prefix',
        inputPlaceholder: 'Enter your URL',
        background: '#0f0522',
        color: '#ffffff',
        confirmButtonColor: '#8a2be2',
        showCancelButton: true,
        cancelButtonColor: '#ff4dfb',
        inputValidator: (value) => {
            if (!value) {
                return 'You need to enter a URL!';
            }
            if (!value.startsWith('http')) {
                return 'Please enter a valid URL starting with http/https';
            }
        }
    });

    if (modelURL) {
        modelURLPrefix = modelURL.endsWith('/') ? modelURL : modelURL + '/';
        modelUrlInput.value = modelURLPrefix;
        await loadModel();
    } else {
        await Swal.fire({
            title: 'Cancelled',
            text: 'No URL was entered',
            icon: 'info',
            background: '#0f0522',
            color: '#ffffff',
            confirmButtonColor: '#8a2be2'
        });
    }
}

async function loadModelFromInput() {
    const urlInput = modelUrlInput.value.trim();

    if (!urlInput) {
        disableInteraction();
        await Swal.fire({
            title: 'URL Required',
            text: 'Please enter a Teachable Machine model URL',
            icon: 'error',
            background: '#0f0522',
            color: '#ffffff',
            confirmButtonColor: '#ff4dfb'
        });
        return;
    }


    modelURLPrefix = urlInput.endsWith('/') ? urlInput : urlInput + '/';
    modelUrlInput.value = modelURLPrefix;

    try {
        await loadModel();
        enableInteraction(); 
    } catch (error) {
        disableInteraction(); 
        await Swal.fire({
            title: 'Load Failed',
            html: `Could not load model:<br><small>${error.message}</small>`,
            icon: 'error',
            background: '#0f0522',
            color: '#ffffff',
            confirmButtonColor: '#ff4dfb'
        });
    }
}

async function loadModel() {
    try {
        const modelURL = modelURLPrefix + "model.json";
        const metadataURL = modelURLPrefix + "metadata.json";

        Swal.fire({
            title: 'Loading AI Model',
            html: 'Please wait while we load the Teachable Machine model...',
            background: '#0f0522',
            color: '#ffffff',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        Swal.close();

        await Swal.fire({
            title: 'Model Loaded',
            text: `Successfully loaded model with ${maxPredictions} classes`,
            icon: 'success',
            background: '#0f0522',
            color: '#ffffff',
            confirmButtonColor: '#8a2be2'
        });

        
        enableInteraction(); 
        labelContainer.innerHTML = "";

    } catch (error) {
        Swal.fire({
            title: 'Load Failed',
            html: `Could not load model:<br><small>${error.message}</small>`,
            icon: 'error',
            background: '#0f0522',
            color: '#ffffff',
            confirmButtonColor: '#ff4dfb'
        });
    }
}

// ───── Prediction ─────
async function predictImage(image) {
    if (!model || !labelContainer) return;
    const prediction = await model.predict(image);
    updatePredictionDisplay(prediction);
    const topPrediction = prediction.reduce((a, b) => a.probability > b.probability ? a : b);
    await sendToMicrobit(topPrediction.className);
}

async function predictWebcam() {
    if (!model || !labelContainer) return;
    const prediction = await model.predict(webcam.canvas);
    updatePredictionDisplay(prediction);
    const topPrediction = prediction.reduce((a, b) => a.probability > b.probability ? a : b);
    await sendToMicrobit(topPrediction.className);
}

function updatePredictionDisplay(prediction) {
    if (labelContainer.children.length === 0) {
        labelContainer.innerHTML = '';
        for (let i = 0; i < maxPredictions; i++) {
            const div = document.createElement('div');
            div.className = 'prediction-row';
            labelContainer.appendChild(div);
        }
    }

    prediction.forEach((p, i) => {
        const percentage = Math.round(p.probability * 100);
        labelContainer.childNodes[i].innerHTML = `
            <div class="box-lable-predic">
                <span class="label-name">${p.className}:</span>
                <span class="label-percent">${percentage}%</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${percentage}%"></div>
            </div>
        `;
    });
}

// ───── Webcam Control ─────
async function startWebcam() {
    try {
        await checkWebcamSupport();

        if (webcam) {
            await webcam.stop();
        }

        webcam = new tmImage.Webcam(350, 350, true);
        await webcam.setup();
        await webcam.play();

        const webcamContainer = document.getElementById("webcam-container");
        webcamContainer.innerHTML = "";
        webcamContainer.appendChild(webcam.canvas);

        window.requestAnimationFrame(loop);
    } catch (error) {
        console.error("Webcam error:", error);
        await Swal.fire({
            icon: 'error',
            title: 'Webcam Error',
            text: 'Please allow webcam access',
            confirmButtonColor: '#ff4dfb',
            background: '#0f0522',
            color: '#ffffff'
        });
    }

}

async function loop() {
    if (mode === "webcam" && webcam) {
        webcam.update(); // update the webcam frame
        await predictWebcam();
        window.requestAnimationFrame(loop);
    }
}

function enableInteraction() {
    modeSelect.disabled = false;
    imageUpload.disabled = false;
}

function disableInteraction() {
    modeSelect.disabled = true;
    imageUpload.disabled = true;
}

async function checkWebcamSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser does not support Webcam or does not allow it.");
    }
}

// ───── micro:bit Connection ─────
async function connectMicrobit() {
    if (port) {
        Swal.fire({
            icon: 'warning',
            title: 'Already Connected',
            text: 'The micro:bit is already connected.',
            confirmButtonColor: '#8a2be2',
            background: '#0f0522',
            color: '#ffffff'
        });
        return;
    }

    try {
        if (!navigator.serial) {
            await Swal.fire({
                icon: 'error',
                title: 'Not Supported',
                text: 'Web Serial API is not supported in this browser',
                confirmButtonColor: '#8a2be2',
                background: '#0f0522',
                color: '#ffffff'
            });
            return;
        }

        const filters = [{ usbVendorId: 0x0D28 }];
        port = await navigator.serial.requestPort({ filters });

        await port.open({ baudRate: 115200 });

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        // Hide connect button and show disconnect button
        document.querySelector('.connect-wrap button:first-child').style.display = 'none';
        btnDisconnectMicrobit.style.display = 'block';

        await Swal.fire({
            icon: 'success',
            title: 'Connected!',
            text: 'Successfully connected to micro:bit',
            confirmButtonColor: '#8a2be2',
            background: '#0f0522',
            color: '#ffffff'
        });

        updateStatus(true);

    } catch (err) {
        port = null;
        writer = null;

        if (err.name !== "NotFoundError") {
            Swal.fire({
                icon: 'error',
                title: 'Connection Error',
                html: `Failed to connect:<br><small>${err}</small>`,
                background: '#0f0522',
                color: '#ffffff',
                confirmButtonColor: '#ff4dfb'
            });
        }
        updateStatus(false);
    }
}

async function disconnectMicrobit() {
    try {
        if (writer) {
            try {
                await writer.write("DISCONNECT\n").catch(e => console.log("Write error:", e));
                await writer.close().catch(e => console.log("Writer close error:", e));
                writer = null;
            } catch (err) {
                console.error("Error closing writer:", err);
            }
        }

        if (port) {
            try {
                if (port.readable) {
                    await port.readable.cancel().catch(e => console.log("Readable cancel error:", e));
                }
                if (port.writable) {
                    await port.writable.abort().catch(e => console.log("Writable abort error:", e));
                }
                // Close port
                await port.close().catch(e => console.log("Port close error:", e));
                port = null;
            } catch (err) {
                console.error("Error closing port:", err);
            }
        }


        btnDisconnectMicrobit.style.display = 'none';
        document.querySelector('.connect-wrap button:first-child').style.display = 'block';

        await Swal.fire({
            icon: 'success',
            title: 'Disconnected!',
            text: 'Successfully disconnected from micro:bit',
            confirmButtonColor: '#8a2be2',
            background: '#0f0522',
            color: '#ffffff'
        });

        updateStatus(false);

    } catch (err) {
        port = null;
        writer = null;
        await Swal.fire({
            icon: 'error',
            title: 'Disconnect Error',
            text: 'Failed to properly disconnect: ' + err.message,
            confirmButtonColor: '#ff4dfb',
            background: '#0f0522',
            color: '#ffffff'
        });
    }
}

function updateStatus(connected) {
    const statusDiv = document.getElementById("status");
    statusDiv.innerHTML = connected
        ? `<i class="fa-solid fa-plug-circle-check"></i> Connected to micro:bit!`
        : `<i class="fa-solid fa-plug-circle-xmark"></i> Not Connected`;
    statusDiv.classList.toggle("connected", connected);
    statusDiv.classList.toggle("disconnected", !connected);
}

async function sendToMicrobit(message) {
    if (writer) {
        await writer.write(message + "\n");
    }
}