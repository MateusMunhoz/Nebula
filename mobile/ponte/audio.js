// Áudio da voz no iPhone (Fase 1): quando a página abre o microfone, a sessão de áudio vai para o alto-falante (e o fone
// Bluetooth); quando o último microfone fecha, volta ao normal. Tudo daqui, sem o renderer saber: ele só chama
// getUserMedia e track.stop(), como no desktop. O nativo é o NebulaAudioPlugin (ios/App/App/SceneDelegate.swift).
import { registerPlugin, Capacitor } from '@capacitor/core';

const NebulaAudio = registerPlugin('NebulaAudio');
const microfones = new Set(); // faixas de áudio do getUserMedia ainda abertas
let ligada = false;

function ajustar() {
  const querer = microfones.size > 0;
  if (querer === ligada) return;
  ligada = querer;
  NebulaAudio.voz({ ligada: querer }).catch((e) => console.warn('NebulaAudio:', e && e.message));
}

function esquecer(track) {
  if (microfones.delete(track)) ajustar();
}

export function instalarAudio() {
  if (!Capacitor.isNativePlatform() || !navigator.mediaDevices?.getUserMedia) return;
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await original(constraints);
    for (const track of stream.getAudioTracks()) {
      microfones.add(track);
      track.addEventListener('ended', () => esquecer(track)); // o sistema tirou o microfone (ligação, outro app)
    }
    ajustar();
    return stream;
  };
  // track.stop() não dispara 'ended': é por aqui que a saída da voz chega
  const parar = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function () {
    parar.call(this);
    esquecer(this);
  };
}
