'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// The module 'azdata' contains the Azure Data Studio extensibility API
// This is a complementary set of APIs that add SQL / Data-specific functionality to the app
// Import the module and reference it with the alias azdata in your code below

import * as azdata from 'azdata';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "sql-object-search" is now active!');

    const sqlTypes = [
        'Table',
        'StoredProcedure',
        'View',
        'ScalarValuedFunction',
        'TableValuedFunction',
    ];

    const selectChild = (node: azdata.objectexplorer.ObjectExplorerNode | undefined): Thenable<azdata.objectexplorer.ObjectExplorerNode | undefined> => {
        console.log(node);
        if (!node) {
            return Promise.reject();
        };
        return node.getChildren().then(children => {
            if (children.length === 0 || sqlTypes.includes(node.nodeType)
            ) {
                return node;
            }
            return vscode.window.showQuickPick(
                children.map(node => node.label)
            ).then((label) => {
                const node = children.find(node => node.label === label);
                return selectChild(node);
            });
        });
    };

    const escapeSqlString = (input: string, escapeChar: string = "'"): string => {
        return input.replace("'", escapeChar);
    };

    const objectDefinitionQuery = (schema: string, name: string) => {
        return `
            SELECT TOP 1 SCHEMA_NAME(obj.schema_id), obj.name, definition, obj.type
            FROM sys.sql_modules sql
            JOIN sys.objects obj on sql.object_id = obj.object_id
            WHERE obj.name = '${escapeSqlString(name)}'
                AND SCHEMA_NAME(obj.schema_id) = '${escapeSqlString(schema)}';
        `;
    };
    const definitionIndex = 2; // in above query, the definition is the 2-index result

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    context.subscriptions.push(vscode.commands.registerCommand('sql-object-search.searchConnection', async () => {
        // The code you place here will be executed every time your command is executed

        const connection = await azdata.connection.getCurrentConnection();
        if (!connection) {
            vscode.window.showErrorMessage('No current connection');
            return;
        }

        const rootNode = await azdata.objectexplorer.getNode(connection.connectionId);

        const folders = await rootNode.getChildren();

        // TODO - figure out a way to do tables
        // const tables = await folders.find(node => node.label === 'Tables')?.getChildren() || [];
        const views = (
            await folders.find(node => node.label === 'Views')?.getChildren() || []
        ).filter(node => node.nodeType === 'View');

        const programmability = await folders.find(node => node.label === 'Programmability')?.getChildren() || [];
        const sprocs = await programmability.find(({ label }) => label === 'Stored Procedures')?.getChildren() || [];

        const functionFolders = await programmability.find(({ label }) => label === 'Functions')?.getChildren() || [];
        const functions = (
            await Promise.all(functionFolders.map(async folder => folder.getChildren()))
        ).reduce((acc, func) => acc.concat(func), []);

        const objects = views.concat(sprocs, functions);

        const pickOptions = objects
            .sort((node1, node2) => node1.label.localeCompare(node2.label))
            .map(node => {
                const { name, schema } = node.metadata || {};

                // for some reason, below doesn't work and won't show the icon
                // const iconPath = vscode.Uri.file('C:\\Users\\DerekVance\\sql-object-search\\images\\folder.svg');

                return {
                    label: node.label,
                    description: node.nodeType, // schema ? schema + ' ' + node.nodeType : node.nodeType,
                    schema: schema,
                    name: name,
                    // iconPath: iconPath,
                };
            });

        const pick = await vscode.window.showQuickPick(pickOptions, {
            title: 'SQL Object Search',
            matchOnDescription: true,
        });
        if (pick) {
            const { schema, name } = pick;
            if (schema && name) {
                const provider = azdata.dataprotocol.getProvider<azdata.QueryProvider>('MSSQL', azdata.DataProviderType.QueryProvider);
                const queryString = objectDefinitionQuery(schema, name);
                const ownerUri = await azdata.connection.getUriForConnection(connection.connectionId);
                const result = await provider.runQueryAndReturn(ownerUri, queryString);
                if (result && result.rowCount > 0) {
                    const definition = result.rows[0][definitionIndex].displayValue;
                    const queryDocument = await azdata.queryeditor.openQueryDocument({ content: definition });
                    if (definition.length === 65535) {
                        vscode.window.showWarningMessage(`The object definition for ${schema}.${name} has likely been truncated!`);
                    }
                    await queryDocument.connect(connection);
                }
            }
        }
    }));


    context.subscriptions.push(vscode.commands.registerCommand('sql-object-search.exploreConnection', () => {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user
        azdata.connection.getCurrentConnection().then((connection: azdata.connection.ConnectionProfile) => {
            if (connection) {
                azdata.objectexplorer.getNode(connection.connectionId)
                    .then(root => selectChild(root))
                    .then(node => {
                        console.log('done!');
                        console.log(node);
                        if (!node || !node.metadata) {
                            return;
                        }
                        const { schema, name } = node.metadata;
                        const provider = azdata.dataprotocol.getProvider<azdata.QueryProvider>('MSSQL', azdata.DataProviderType.QueryProvider);
                        const queryString = objectDefinitionQuery(schema, name);

                        return azdata.connection.getUriForConnection(connection.connectionId).then(ownerUri => {
                            return provider.runQueryAndReturn(ownerUri, queryString);
                        });
                    })
                    .then(result => {
                        if (result && result.rowCount > 0) {
                            const [schema, name, definition, type] = result.rows[0].map(v => v.displayValue);
                            if (definition.length === 65535) {
                                vscode.window.showWarningMessage(`The object definition for ${schema}.${name} has likely been truncated!`);
                            }
                            return azdata.queryeditor.openQueryDocument({ content: definition });
                        } else {
                            vscode.window.showErrorMessage('No definition found');
                        }
                    })
                    .then(queryDocument => {
                        if (queryDocument) {
                            queryDocument.connect(connection);
                        }
                    });
            } else {
                vscode.window.showErrorMessage('No connection found!');
            }
        }, error => {
            console.info(error);
        });
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}