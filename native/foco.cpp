// foco.exe: para "O que estou fazendo" da atividade do perfil (docs/spec/tarefa.md).
// Uso: foco.exe   (sem argumentos; roda, escreve uma linha e fecha)
// Saída: "<nome do .exe em primeiro plano>\t<ms sem teclado nem mouse>\n", o nome em UTF-8, só o arquivo (sem a pasta).
// Nada em primeiro plano (ou sem acesso ao processo): "\t<ms>". Nunca lê o título da janela.
#include <windows.h>
#include <cstdio>
#include <string>

int main() {
  LASTINPUTINFO lii{ sizeof(LASTINPUTINFO) };
  const DWORD ocioso = GetLastInputInfo(&lii) ? GetTickCount() - lii.dwTime : 0xFFFFFFFFu; // sem a leitura: "parado"
  std::string nome;
  DWORD pid = 0;
  HWND janela = GetForegroundWindow();
  if (janela) GetWindowThreadProcessId(janela, &pid);
  if (pid) {
    HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (proc) {
      wchar_t caminho[MAX_PATH * 2];
      DWORD tam = sizeof(caminho) / sizeof(caminho[0]);
      if (QueryFullProcessImageNameW(proc, 0, caminho, &tam)) {
        const wchar_t* arquivo = caminho;
        for (const wchar_t* p = caminho; *p; p++) if (*p == L'\\' || *p == L'/') arquivo = p + 1;
        char utf8[MAX_PATH * 4];
        const int n = WideCharToMultiByte(CP_UTF8, 0, arquivo, -1, utf8, sizeof(utf8), nullptr, nullptr);
        if (n > 1) nome.assign(utf8, n - 1);
      }
      CloseHandle(proc);
    }
  }
  std::printf("%s\t%lu\n", nome.c_str(), static_cast<unsigned long>(ocioso));
  return 0;
}
