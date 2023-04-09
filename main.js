// Get DOM Elements
const audioElement = document.getElementById('audio');
const playButton = document.getElementById('play-button');
const stopButton = document.getElementById('stop-button');
const volumeRange = document.getElementById('volume-range');
const cutStartInput = document.getElementById('start-time');
const cutEndInput = document.getElementById('end-time');
const cutButton = document.getElementById('cut-button');
const exportButton = document.getElementById('export-button');
const cuttedAudios = document.querySelector('.cutted-audios');
const audioCutted = document.querySelector('#audio-cutted');
const namedAudioInput = document.querySelector('#named-audio')
const fileTitle = document.querySelector('#file-title')

let audioSize;
let audioDuration;
let costPerSecond;
let file;

// Audio Context
const audioCtx = new AudioContext();
let audioSource;

// Play Audio
function playAudio() {
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement.play();
}

// Stop Audio
function stopAudio() {
  audioElement.pause();
  audioElement.currentTime = 0;
}

// Change Volume
function changeVolume() {
  const volume = volumeRange.value;
  audioElement.volume = volume;
}

// Cut Audio
function cutAudio() {
  const start = parseFloat(cutStartInput.value);
  const end = parseFloat(cutEndInput.value);
  if (start < 0 || end > audioDuration || start >= end) {
    alert('Invalid start/end values.');
    return;
  }

  const audioBlob = new Blob([file], { type: 'audio/mp3' });
  const mewAudioBlob = audioBlob.slice(parseFloat(start*costPerSecond), parseFloat(end*costPerSecond), 'audio/mp3');

  const reader = new FileReader();
  reader.readAsDataURL(mewAudioBlob);
  reader.onload = function () {
    audioCutted.src = reader.result;
  };

  exportButton.disabled = false
}

// Export Audio
function exportAudio() {
  const audioName = namedAudioInput.value ?? 'defaut-name'
  const downloadLink = document.createElement('a');
  downloadLink.href = audioCutted.src;
  downloadLink.download = `${audioName}.mp3`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// Event Listeners
playButton.addEventListener('click', playAudio);
stopButton.addEventListener('click', stopAudio);
volumeRange.addEventListener('input', changeVolume);
cutButton.addEventListener('click', cutAudio);
exportButton.addEventListener('click', exportAudio);

// Load Audio
const audioFileInput = document.getElementById('audio-file');
audioFileInput.addEventListener('change', function () {
  file = audioFileInput.files[0];
  if (!file) {
    return;
  }
  audioSize = file.size
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = function () {
    audioCtx.decodeAudioData(reader.result, function (buffer) {
      audioSource = audioCtx.createBufferSource();
      audioDuration = buffer.duration;
      audioSource.buffer = buffer;
      audioSource.connect(audioCtx.destination);
      audioElement.src = URL.createObjectURL(file);
      audioElement.onloadedmetadata = function () {
        audioElement.onreadystatechange = (event) => {
          if (event.target.readyState === "complete") {
            cutEndInput.value = audioElement.duration;
          }
        }
      };


      costPerSecond = audioSize/audioDuration;
      cutEndInput.value = audioDuration
      playButton.disabled = false
      stopButton.disabled = false
      cutButton.disabled  = false
      fileTitle.textContent = file.name
    });
  };

});
