import * as vscode from 'vscode'
import * as path from 'path';

import {TypeScriptImporter} from './TypeScriptImporter';
import {Symbol} from './ImportIndex';

export class Importer {

    private spacesBetweenBraces: boolean;
    private doubleQuotes: boolean;
    private removeFileExtensions: string[];

    constructor( private importer: TypeScriptImporter ) 
    {
        this.spacesBetweenBraces = importer.conf<boolean>('spaceBetweenBraces', true);
        this.doubleQuotes = importer.conf<boolean>( 'doubleQuotes', false );
        this.removeFileExtensions = importer.conf<string>('removeFileExtensions', '.d.ts,.ts,.tsx').trim().split(/\s*,\s*/);
    }

    public importSymbol( document: vscode.TextDocument, symbol: Symbol): void 
    {
        let module = this.resolveModule( document, symbol );

        var importRegExp = /\bimport\s+(?:({?)\s*(.+?)\s*}?\s+from\s+)?[\'"]([^"\']+)["\']\s*;?/g;

        let currentDoc = document.getText();

        var matches: string[];

        var lastImport: vscode.Position = null;

        let edit: vscode.WorkspaceEdit;

        while( ( matches = importRegExp.exec( currentDoc ) ) )
        {
            lastImport = document.positionAt( currentDoc.indexOf( matches[0] ) );

            var isDefault = matches[1] != "{";
            
            if( matches[3] == module && symbol.isDefault == isDefault )
            {
                let symbols = matches[2].split( /\s*,\s*/g );

                let symbolName = symbol.asDefinition ? symbol.asDefinition : symbol.name; 

                if( symbols.indexOf( symbolName ) < 0 )
                    symbols.push( symbolName );
                
                if( ( symbol.isDefault || isDefault ) && symbols.length > 1 )
                    continue;

                edit = new vscode.WorkspaceEdit();
                edit.replace( 
                    document.uri, 
                    new vscode.Range(lastImport.line, lastImport.character, lastImport.line, lastImport.character + matches[0].length), 
                    this.createImportStatement( this.createImportDefinition( symbols.join(', '), isDefault ), module, false ) 
                );
                break;
            }
        }

        if( !edit )
        {
            edit = new vscode.WorkspaceEdit();
            edit.insert( 
                document.uri, 
                new vscode.Position( lastImport ? lastImport.line + 1 : 0, 0), 
                this.createImportStatement( this.createImportDefinition( symbol.asDefinition ? symbol.asDefinition : symbol.name, symbol.isDefault ), module, true ) 
            );
        }

        vscode.workspace.applyEdit(edit);
    }

    public createImportDefinition( definitions: string, skipBrakets: boolean = false ): string
    {
        var definition = skipBrakets ? '' : '{';

        if (this.spacesBetweenBraces && skipBrakets == false)
            definition += ' ';

        definition += definitions;

        if (this.spacesBetweenBraces && skipBrakets == false)
            definition += ' ';

        definition += skipBrakets ? '' : '}';

        return definition;
    }

    public createImportStatement( definition: string, module: string, endline: boolean = false): string 
    {
        let q = this.doubleQuotes ? '"' : "'";
        let NL = endline ? '\n' : '';

        let importStatement = 'import ' + definition + ' from ' + q + module + q + ";" + NL;
        return importStatement;
    }

    public removeFileExtension( fileName: string ): string
    {
        for( var i = 0; i<this.removeFileExtensions.length; i++ )
        {
            var e = this.removeFileExtensions[i];

            if( fileName.endsWith( e ) )
                return fileName.substring( 0, fileName.length - e.length );
        }

        return fileName;
    }

    public resolveModule(document: vscode.TextDocument, symbol: Symbol): string 
    {
        if( symbol.module )
            return symbol.module;

        var moduleParts = path.relative( path.dirname( document.fileName ), symbol.path ).split( /[\\/]/ );
        
        if( moduleParts[0] !== '.' )
            moduleParts.splice( 0, 0, '.' );

        var fileIdx = moduleParts.length - 1;

        moduleParts[fileIdx] = this.removeFileExtension( moduleParts[fileIdx] );

        return moduleParts.join( "/" );
    }
}