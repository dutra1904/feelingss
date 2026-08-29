# feelingss

App de webcam que detecta o rosto e estima **idade**, **humor** e **sexo**, no estilo daqueles projetos de visão computacional com caixa verde e legendas.

## Como funciona

O programa faz três coisas em sequência, a cada frame da câmera:

1. **Detecta o rosto** com OpenCV YuNet.
2. **Analisa o recorte** com DeepFace (redes já treinadas).
3. **Desenha** a caixa e as três linhas: idade, humor e sexo.

A análise pesada não roda em todo frame — só a cada ~12 frames — para a imagem continuar fluida.

## Como rodar

Você precisa de Python 3.10+ e uma webcam.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Na primeira execução o DeepFace baixa os modelos (pode demorar). Depois fica bem mais rápido.

Aperte **Q** para sair.

## Versão web

A pasta `web/` é o mesmo projeto no navegador: a câmera roda no Chrome/Edge e os modelos de idade, humor e sexo baixam do CDN. Não usa o DeepFace do Python.

```powershell
cd web
python -m http.server 8000
```

Abra [http://localhost:8000](http://localhost:8000), clique em **Abrir câmera** e permita o acesso. Não abra o `index.html` direto pelo Explorer (`file://`) — a webcam costuma bloquear.

Para publicar, envie a pasta `web/` para GitHub Pages, Netlify ou Vercel. A página precisa de HTTPS (ou localhost) para a câmera funcionar.

## O que esperar

São **estimativas**, não fatos. Luz ruim, ângulo de lado, óculos escuros ou criança vs adulto mudam o resultado. O humor costuma oscilar se a expressão for neutra.

## Próximos passos

- Salvar um recorte + resultado em JSON.
