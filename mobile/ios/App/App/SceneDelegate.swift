import UIKit
import AVFoundation
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NebulaViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// A WebView do Capacitor com os plugins do próprio Nebula registrados (ficam neste arquivo para não mexer no
// project.pbxproj). A ponte JS chama pelo nome do jsName (mobile/ponte/audio.js).
class NebulaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NebulaAudioPlugin())
    }
}

// Sessão de áudio da voz (docs/spec/nebula-ios-sideload.md, Fase 1): sem isto o iOS manda a voz para o alto-falante
// de ouvido (baixinho) quando o microfone liga. Na voz: .playAndRecord no alto-falante, com fone Bluetooth se houver.
// Fora dela: .playback, para o som das telas tocar mesmo com a chave de silencioso.
@objc(NebulaAudioPlugin)
public class NebulaAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NebulaAudioPlugin"
    public let jsName = "NebulaAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "voz", returnType: CAPPluginReturnPromise)
    ]

    @objc func voz(_ call: CAPPluginCall) {
        let ligar = call.getBool("ligada") ?? false
        let sessao = AVAudioSession.sharedInstance()
        do {
            if ligar {
                try sessao.setCategory(.playAndRecord, mode: .videoChat,
                                       options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
            } else {
                try sessao.setCategory(.playback, mode: .default, options: [])
            }
            try sessao.setActive(true)
            call.resolve()
        } catch {
            call.reject("Não deu para ajustar o áudio: \(error.localizedDescription)")
        }
    }
}
