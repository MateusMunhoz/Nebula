// foco.exe: para "O que estou fazendo" da atividade do perfil (docs/spec/tarefa.md).
// Em C# para compilar com o csc.exe que já vem no Windows (.NET Framework 4), sem o Visual Studio: native\build.cmd foco
// Uso: foco.exe   (sem argumentos; roda, escreve uma linha e fecha)
// Saída: "<nome do .exe em primeiro plano>\t<ms sem teclado nem mouse>\n", só o arquivo (sem a pasta).
// Nada em primeiro plano (ou sem acesso ao processo): "\t<ms>". Nunca lê o título da janela.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class Foco {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO lii);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr janela, out uint pid);
  [DllImport("kernel32.dll")] static extern uint GetTickCount();
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint acesso, bool herdar, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr proc, uint flags, StringBuilder caminho, ref uint tam);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

  static int Main() {
    var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) };
    uint ocioso = GetLastInputInfo(ref lii) ? unchecked(GetTickCount() - lii.dwTime) : uint.MaxValue; // sem a leitura: "parado"
    string nome = "";
    uint pid = 0;
    IntPtr janela = GetForegroundWindow();
    if (janela != IntPtr.Zero) GetWindowThreadProcessId(janela, out pid);
    if (pid != 0) {
      IntPtr proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
      if (proc != IntPtr.Zero) {
        var caminho = new StringBuilder(1024);
        uint tam = (uint)caminho.Capacity;
        if (QueryFullProcessImageName(proc, 0, caminho, ref tam)) nome = Path.GetFileName(caminho.ToString());
        CloseHandle(proc);
      }
    }
    var saida = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
    saida.Write(nome + "\t" + ocioso + "\n");
    saida.Flush();
    return 0;
  }
}
