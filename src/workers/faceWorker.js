import * as faceapi from 'face-api.js';

self.onmessage = async (event) => {
  const { imageUrls } = event.data;
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');

    const encodings = [];

    for (const url of imageUrls) {
      const img = await faceapi.fetchImage(url);
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) encodings.push(detection.descriptor);
    }

    if (encodings.length === 0) {
      self.postMessage({ error: "No face detected." });
      return;
    }

    const encoding = encodings[0]; // only one photo
    self.postMessage({ encoding });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
