/*
La función enumera "Figura [0-9]*". 
Cada imagen por lo menos debe tener el texto de Figura para que esto pase.
La función no coloca Figura automáticamente.
*/
function enumerarFiguras() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const paragraphs = body.getParagraphs();
  
  let contador = 1;

  paragraphs.forEach(p => {
    const texto = p.getText().trim();

    // 🚫 Debe ser hijo directo del body
    if (p.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) return;

    // 🚫 Verificar si tiene getListId antes de usarlo
    if (typeof p.getListId === "function" && p.getListId()) return;

    // 🚫 Solo estilo normal
    if (p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL) return;

    if (!texto) return;

    // ✅ Solo "Figura" o "Figura X"
    if (/^Figura(\s\d+)?$/i.test(texto)) {
      const nuevoTexto = "Figura " + contador;
      p.setText(nuevoTexto);

      p.editAsText().setBold(0, nuevoTexto.length - 1, true);

      contador++;
    }
  });
}

//Not working
function ordenarReferencias(
  heading_name = "Referencias",
  hangingIndentInches = 0.5,
  lineSpacing = 2
) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const paragraphs = body.getParagraphs();

  let startIndex = -1;

  // 🔍 Buscar el heading
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (
      p.getText().trim().toLowerCase() === heading_name.toLowerCase() &&
      p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL
    ) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    Logger.log("No se encontró el heading: " + heading_name);
    return;
  }

  // 📚 Agrupar en bloques
  let bloques = [];
  let bloqueActual = null;

  for (let i = startIndex + 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];

    // detener si aparece otro heading
    if (p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL) break;

    const texto = p.getText().trim();
    if (!texto) continue;

    const indent = p.getIndentStart();

    const esNuevoBloque =
      !bloqueActual || indent === 0;

    if (esNuevoBloque) {
      if (bloqueActual) bloques.push(bloqueActual);

      bloqueActual = {
        text: texto,
        elements: [p.copy()]
      };
    } else {
      bloqueActual.text += " " + texto;
      bloqueActual.elements.push(p.copy());
    }
  }

  if (bloqueActual) bloques.push(bloqueActual);
  if (bloques.length === 0) return;

  // 🔤 Ordenar bloques
  bloques.sort((a, b) =>
    a.text.localeCompare(b.text, undefined, { sensitivity: "base" })
  );

  // 🧹 Eliminar originales
  for (let i = startIndex + 1; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL) break;
    body.removeChild(p);
    i--;
    paragraphs.splice(i, 1);
  }

  // ✍️ Insertar bloques ordenados
  let insertIndex = startIndex + 1;

  bloques.forEach(bloque => {
    bloque.elements.forEach((el, idx) => {
      const newParagraph = body.insertParagraph(insertIndex, el);

      // Aplicar formato APA
      const indentPoints = hangingIndentInches * 72;

      newParagraph.setIndentStart(indentPoints);
      newParagraph.setIndentFirstLine(0);
      newParagraph.setLineSpacing(lineSpacing);

      insertIndex++;
    });
  });
}