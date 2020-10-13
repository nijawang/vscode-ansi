import * as ansicolor from "ansicolor";

import {
  TextDocument,
  ProviderResult,
  DecorationOptions,
  TextEditorDecorationType,
  window,
  Range,
  workspace,
} from "vscode";
import { PrettyAnsiContentProvider } from "./PrettyAnsiContentProvider";

import { TextEditorDecorationProvider } from "./TextEditorDecorationProvider";

type AnsiDecorationOptions = Omit<ansicolor.ParsedSpan, "text">;

function upsert<K, V>(map: Map<K, V>, key: K, value: V): V {
  return map.get(key) ?? (map.set(key, value), value);
}

export class AnsiDecorationProvider implements TextEditorDecorationProvider {
  provideDecorations(document: TextDocument): ProviderResult<[string, DecorationOptions[]][]> {
    if (document.uri.scheme === PrettyAnsiContentProvider.scheme) {
      return this._provideDecorationsForPrettifiedAnsi(document);
    }

    if (document.languageId === "ansi") {
      return this._provideDecorationsForAnsiLanguageType(document);
    }

    return undefined;
  }

  private _provideDecorationsForAnsiLanguageType(
    document: TextDocument
  ): ProviderResult<[string, DecorationOptions[]][]> {
    const documentText = document.getText();

    let offset = 0;
    const result = new Map<string, DecorationOptions[]>();

    for (const span of ansicolor.parse(documentText).spans) {
      const { text, ...options } = span;

      const key = JSON.stringify(options);

      const startOffset = documentText.indexOf(text, offset);
      const endOffset = startOffset + text.length;

      const escapeRange = new Range(document.positionAt(offset), document.positionAt(startOffset));
      upsert(result, "escape", []).push({ range: escapeRange });

      const textRange = new Range(document.positionAt(startOffset), document.positionAt(endOffset));
      upsert(result, key, []).push({ range: textRange });

      offset = endOffset;
    }

    return [...result];
  }

  private async _provideDecorationsForPrettifiedAnsi(
    providerDocument: TextDocument
  ): Promise<[string, DecorationOptions[]][]> {
    const actualUri = PrettyAnsiContentProvider.toActualUri(providerDocument.uri);
    const actualDocument = await workspace.openTextDocument(actualUri);

    const actualDocumentText = actualDocument.getText();

    let offset = 0;
    const result = new Map<string, DecorationOptions[]>();

    for (const span of ansicolor.parse(actualDocumentText).spans) {
      const { text, ...options } = span;

      const key = JSON.stringify(options);

      const endOffset = offset + text.length;

      const textRange = new Range(providerDocument.positionAt(offset), providerDocument.positionAt(endOffset));
      upsert(result, key, []).push({ range: textRange });

      offset = endOffset;
    }

    return [...result];
  }

  private _decorationTypes = new Map<string, TextEditorDecorationType>([
    ["escape", window.createTextEditorDecorationType({ opacity: "50%" })],
  ]);

  resolveDecoration(key: string): ProviderResult<TextEditorDecorationType> {
    let decorationType = this._decorationTypes.get(key);

    if (decorationType) {
      return decorationType;
    }

    const options: AnsiDecorationOptions = JSON.parse(key);

    decorationType = window.createTextEditorDecorationType({
      textDecoration: options.css,
    });

    this._decorationTypes.set(key, decorationType);

    return decorationType;
  }

  private _isDisposed = false;

  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;

    for (const decorationType of this._decorationTypes.values()) {
      decorationType.dispose();
    }

    this._decorationTypes.clear();
  }
}
