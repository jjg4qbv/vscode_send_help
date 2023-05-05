import fetch from 'node-fetch';
import * as logger from './logger'
import { CompilerExplorerResponse, GodboltLabel } from './compiler-explorer-types';
import { getCompilerExplorerHost, getCompilerOptions, getCompilerCode, getCompilerIncludes, getCppPasses } from './config';
import {BaseCompiler} from '../compiler-explorer/lib/base-compiler';
import { makeFakeParseFiltersAndOutputOptions } from '../compiler-explorer/test/utils';
import * as vscode from 'vscode';
import { squiggleDecoration, setDecorated } from './compiler-view';
import * as fs from 'fs';

export default class CompilerExplorer {
    currentData: CompilerExplorerResponse | null;
    // baseCompiler: BaseCompiler | null;
    // The godbolt compiler provides additional info about the location of labels.
    getAdditionalLabelInfo() : Array<GodboltLabel[]> {
        return this.currentData.asm.map(line => line.labels);
    }

    getSourceLineRange(disassemblyLineNumber: number) : number | null {
        if( !this.currentData ) {
            return null;
        }

        return this.currentData.asm[disassemblyLineNumber].source.line - 1;
    }

    getDisassembledLineRange(sourceLineNumber: number) : Array<number> | null {
        if( !this.currentData ) {
            return null;
        }

        let lineNumber = sourceLineNumber + 1;

        let startLine = 0;
        let size = 0;
        for( let asmLine of this.currentData.asm ) {
            if( !asmLine.source ) {
                if( size == 0 ) {
                    startLine += 1;
                    continue;
                }
                else {
                    break;
                }
            }

            const { file, line } = asmLine.source;
            if( line > lineNumber ) {
                break;
            }
            else if( line == lineNumber ) {
                size += 1;
            }
            else {
                startLine += 1;
            }
        }

        if( size > 0 ) {
            return [startLine, startLine + size -1];
        }
        else {
            return null;
        }
    }

    getCompileAPIUserOptions(lang : string) : string {
        let options = [getCompilerOptions(lang)];
        let additionalIncludes = getCompilerIncludes().map((inc: string) => { 
            let sanitized = inc.replace(/\\/g, '/');
            return `-I "${sanitized}"`; 
        });
        return options.concat(additionalIncludes).join(' ');
    }

    getCompileAPIOptions(userOptions: string) : any {
        return {
            userArguments: userOptions,
            filters: {
                binary: false,
                execute: false,
                intel: true,
                demangle: true,
                labels: true,
                libraryCode: false,
                directives: true,
                commentOnly: true,
                trim: false
            },
            compilerOptions: {
                produceGccDump: {},
                produceCfg: false
            },
            tools: [],
            libraries: []
        };
    }

    logOutput(json: CompilerExplorerResponse) {
        // logger.debug(JSON.stringify(json, null, 2));
        let compilerOutput = [];
        if( json.stdout ) {
            compilerOutput = compilerOutput.concat(json.stdout);
        }
        if( json.stderr ) {
            compilerOutput = compilerOutput.concat(json.stderr);
        }
        if( json.compilationOptions ) {
            logger.debug(json.compilationOptions.join(' '))
        }
        logger.info(compilerOutput.map(l => l.text).join('\n'));
    }

    async compile(language: string, source: string) {
        // console.log(source);
        logger.debug("Fetching Compilation");
        // const apiHost = getCompilerExplorerHost();
        const apiHost = "http://localhost:10240";
        const compiler = getCompilerCode(language);
        const options = this.getCompileAPIOptions(this.getCompileAPIUserOptions(language));
        // console.log(apiHost);
        // var baseCompiler = new BaseCompiler();
        // console.log(options);
        // console.log(inputFile);
        // console.log(this.baseCompiler);
        // var local_compile = this.baseCompiler.runCompiler(compiler, options, inputFile, null);
        // console.log(local_compile);
        // return ""
        //console.log(options);
        this.currentData = null;
        // let promiseTest = fetch(`${apiHost}/api/compilers`,{
        //     method: 'GET',
        // });
        // // console.log(promiseTest);
        // console.log(JSON.stringify({
        //     source: source,
        //     lang: language,
        //     options: options,
        //     allowStoreCodeDebug: true,
        //     compiler: compiler
        // }));
        // return promiseTest;
        let initialFetchPromise = fetch(`${apiHost}/api/compiler/${compiler}/compile`, {
            method: 'POST',
            compress: true,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json,  text/javascript, */*'
            },
            body: JSON.stringify({
                source: source,
                lang: language,
                options: options,
                allowStoreCodeDebug: true,
                compiler: compiler
            })
        })
        .then(res => { 
            return res.json(); 
        });
        let processedIFP = initialFetchPromise.then((json: CompilerExplorerResponse) => { 
            //console.log(json);
            this.currentData = json;
            this.logOutput(json);

            if( !json.asm || (json.asm.length === 0 && json.stderr.length > 0) ) {
                return "<Compilation Error>\n" + json.stderr.map(l => l.text).join('\n');
            }
            else {
                // const debugLine = /@llvm\.dbg\.declare/;
                // const debugReference = /!dbg (!\d+)/;
                // var x = json.asm.map(a => {
                //     var string_optnone_removed = a.text.split("optnone ");
                //     var string = string_optnone_removed.join("");
                //     var string_split = string.split(debugReference);
                //     var string_without_debug = "";

                //     for(var s in string_split){
                //         // console.log("string at ind:");
                //         // console.log(string_split[s]);
                //         var last_two_characters = string_split[s].substring(string_split[s].length - 2, string_split[s].length);
                //         var contains_metadata_info = string_split[s].includes("!");
    
                //         if(contains_metadata_info){
                //             //stuff like "!17" belonging to the debug metadata info
                //             continue;
                //         }
                //         else if(last_two_characters == ", "){
                //             //formatting for leftover commands from parsing
                //             string_without_debug = string_without_debug.concat(string_split[s].substring(0, string_split[s].length-2));
                //         }
                //         else{
                //             //rest of string
                //             string_without_debug = string_without_debug.concat(string_split[s]);
                //         }
                //     }
                //     return string_without_debug;
                // }).join("\n");
                // console.log(x);
                // return x; 
                var x = json.asm.map(a => {
                    // var string = a.text.split("optnone ").join("").split("noundef ").join("").split("mustprogress ").join("");
                    var string = a.text.split("noundef ").join("");
                    if(string.includes("attributes")){
                        string = string.split("optnone ").join("").split("mustprogress ").join("");
                    }
                    // var string = string_optnone_removed.join("");

                    return string;
                }).join("\n");
                //console.log(x);
                return x; 
                
                //return json.asm.map(a => a.text).join('\n'); 
            }
        });
        // read from passes file
        console.log(getCppPasses())
        let passes = [
            ["loop-deletion",'indvars'], 
            ["instcombine","mem2reg","jump-threading"],
        ];
        console.log("passes:");
        console.log(passes);
        // allocate array of promises of size 1 greater than the number of passes
        let promises = new Array(passes.length + 1);
        // allocate an array of same size to store the text result of the compilation
        let results = new Array(passes.length + 1);
        // first promise is the initial fetch promise
        
        promises[0] = initialFetchPromise;
        results[0] = processedIFP;
        results[0].then((text) => {
            // console.log(text);
        })
        // for each set of passes, create a promise that fetches the compilation with the pass
        for(let i = 0; i < passes.length; i++) {
            let curr_passes = passes[i];
            let curr_options = this.getCompileAPIOptions("-passes=" + curr_passes.join(","));
            // store the JSON result of the compilation
            promises[i+1] = results[i].then(initial_llvmir => {
                //log the body of the request
                // console.log("body ", i+1);
                // console.log(JSON.stringify({
                //     source: initial_llvmir,
                //     lang: "llvmir",
                //     options: curr_options,
                //     allowStoreCodeDebug: true,
                //     compiler: "opt"
                // }));
                return fetch(`${apiHost}/api/compiler/opt/compile`, {
                    method: 'POST',
                    compress: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json,  text/javascript, */*'
                    },
                    body: JSON.stringify({
                        source: initial_llvmir,
                        lang: "llvmir",
                        options: curr_options,
                        allowStoreCodeDebug: true,
                        compiler: "opt"
                    })
                })
                .then(res => {
                    //console.log("json ", i+1);
                    //console.log(res.json());
                    return res.json();
                });
            });
            promises[i+1].then((json: CompilerExplorerResponse) => {
                console.log("json ", i+1);
                // console.log(json);
            });
            // store the text result of the compilation
            results[i+1] = promises[i+1].then((json: CompilerExplorerResponse) => {
                return json.asm.map(a => {
                    var string = a.text.split("noundef ").join("");
                    if(string.includes("attributes")){
                        string = string.split("optnone ").join("").split("mustprogress ").join("");
                    }
                    
                    //console.log("string ", i+1);
                    //console.log(string);
                    return string;
                }).join('\n');
            });
            results[i+1].then((text: string) => {
                // console.log("text ", i+1);
                // console.log(text);
            });
        }

        let allPromises = Promise.all(promises).then((res) => {
            console.log("all promises");
            // console.log(res);

            let jsonToText = function(json: CompilerExplorerResponse) {
                return json.asm.map(a => a.text).join('\n');
            }
            let initialJSON = res[0];

            let initial_scopes = initialJSON.asm.map(b => b.scope).filter(b => b !== undefined);
            let initial_scopes_filtered = initial_scopes.filter((item, index) => initial_scopes.indexOf(item) === index);

            let lines_that_have_exclam_line_mapping = initialJSON.asm.filter(s => {
                if (!s.text) {
                    return false;
                }
                let r = /^\!\d+ = .*line: \d.*$/gm
                return r.test(s.text);
            });

            let exclam_line_dict = {};
            lines_that_have_exclam_line_mapping.forEach(line => {
                let exclam = line.text.split(" = ")[0];
                let line_number = line.text.split("line: ")[1].split(",")[0];
                exclam_line_dict[exclam] = parseInt(line_number);
            });

            // get mapped values of all exclams in initial_scopes, ignoring any exclams that don't have a line mapping
            let initial_scopes_mapped = initial_scopes_filtered
                                            .map(exclam => exclam_line_dict[exclam])
                                            .filter(exclam => exclam !== undefined);

            
            // repeat the same process for the optimized JSON
            let optimizedJSON = res[res.length - 1];
            let optimized_scopes = optimizedJSON.asm.map(b => b.scope).filter(b => b !== undefined);
            let optimized_scopes_filtered = optimized_scopes.filter((item, index) => optimized_scopes.indexOf(item) === index);

            let optimized_lines_that_have_exclam_line_mapping = optimizedJSON.asm.filter(s => {
                if (!s.text) {
                    return false;
                }
                let r = /^\!\d+ = .*line: \d.*$/gm
                return r.test(s.text);
            });

            let optimized_exclam_line_dict = {};
            optimized_lines_that_have_exclam_line_mapping.forEach(line => {
                let exclam = line.text.split(" = ")[0];
                let line_number = line.text.split("line: ")[1].split(",")[0];
                optimized_exclam_line_dict[exclam] = parseInt(line_number);
            });

            let optimized_scopes_mapped = optimized_scopes_filtered
                                            .map(exclam => optimized_exclam_line_dict[exclam])
                                            .filter(exclam => exclam !== undefined);

            //console.log("initial scopes: ", initial_scopes_mapped);
            //console.log("optimized scopes: ", optimized_scopes_mapped);

            // remove duplicates from both arrays
            let initial_scopes_mapped_filtered = initial_scopes_mapped.filter((item, index) => initial_scopes_mapped.indexOf(item) === index);
            let optimized_scopes_mapped_filtered = optimized_scopes_mapped.filter((item, index) => optimized_scopes_mapped.indexOf(item) === index);

            //find the scopes that were removed
            let removed_scopes = initial_scopes_mapped_filtered.filter(scope => !optimized_scopes_mapped_filtered.includes(scope));

            // find the scopes that were retained
            let retained_scopes = initial_scopes_mapped_filtered.filter(scope => optimized_scopes_mapped_filtered.includes(scope));

            console.log("retained lines: ", retained_scopes);
            console.log("removed lines: ", removed_scopes);

            let activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                let decorations: vscode.DecorationOptions[] = [];
                // let emptyDecorationOptions: vscode.DecorationOptions[] = [];
                // let range = activeEditor.visibleRanges[0]; // Use the range of the visible area for the editor
                // activeEditor.setDecorations(vscode.window.createTextEditorDecorationType({}), emptyDecorationOptions);

                // loop through all line numbers in initial_not_optimized
                let lineCount = activeEditor.document.lineCount;
                let lineIndex = 0;
                let emptyDecorations: vscode.DecorationOptions[] = [];

                let emptyDecoration = vscode.window.createTextEditorDecorationType({});

                for (let line = 0; line < lineCount; line++){
                    let startPos = new vscode.Position(line, activeEditor.document.lineAt(line).firstNonWhitespaceCharacterIndex);
                    let endPos = new vscode.Position(line, activeEditor.document.lineAt(line).text.length);
                    
                    if(line == (removed_scopes[lineIndex] as number)-1){
                        let decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'This code may be removed by one or more optimizations.' };
                        // console.log((lineNumber as number));
                        decorations.push(decoration);
                        lineIndex += 1;
                    }
                    else{
                        let emptyOption: vscode.DecorationRenderOptions = {};
                        let decoration = { range: new vscode.Range(startPos, endPos),  emptyOption};
                        // console.log((lineNumber as number));
                        emptyDecorations.push(decoration);
                    }
                    
                }
                // console.log(decorations);
                
                activeEditor.setDecorations(squiggleDecoration, []);
                activeEditor.setDecorations(squiggleDecoration, decorations);
                setDecorated();
            }

            // return processed final json
            return jsonToText(optimizedJSON);
        });

        //return allPromises;
        //console.log("\n\nn\n\n\n\\n\n\n\n\n\n\n\n\n\n\n\n")

        // let p = Promise.all([initialFetchPromise, promises[1], results[1]]).then(([initialJSON, optimizedJSON, processed]) => {
        //     //console.log("initial IR: ", initialJSON);
        //     let initial_scopes = initialJSON.asm.map(b => b.scope).filter(b => b !== undefined);

            
        //     // filter out duplicates
        //     let initial_scopes_filtered = initial_scopes.filter((item, index) => initial_scopes.indexOf(item) === index);
        //     //console.log(initial_scopes_filtered);

        //     let line_numbers = initialJSON.asm.filter(s => {
        //         if (!s.text) {
        //             return false;
        //         }
        //         let r = /^\!\d+ = .*line: \d.*$/gm
        //         return r.test(s.text);
        //     });

        //     //console.log(line_numbers);
        //     //console.log("h2");
            
        //     //initialize dictionary between exclams and line numbers
        //     let exclam_line_dict = {};

        //     let line_numbers_2 = line_numbers.map(s => {
        //         let s2 = s.text;

        //         let r = /line: \d/gm
        //         let r2 = r.exec(s2)[0];
                
        //         const line = "line: ";
        //         const start = " = ";

        //         let exclam = s2.indexOf(start);
        //         // get part of string up to exclam
        //         let r3 = s2.substring(0, exclam);
        //         // get the number after line
        //         let line_num = parseInt(r2.substring(r2.indexOf(line)+line.length,r2.length));

        //         exclam_line_dict[r3] = line_num;
        //     });

        //     // make an updated dictionary keeping only the keys in the filtered scopes
        //     let exclam_line_dict_filtered = {};
        //     for (var key in exclam_line_dict) {
        //         if (initial_scopes_filtered.includes(key)) {
        //             exclam_line_dict_filtered[key] = exclam_line_dict[key];
        //         }
        //     }


        //     //console.log(exclam_line_dict_filtered);

        //     // repeat the entire filtering process for the optimized IR
        //     let optimized_scopes = optimizedJSON.asm.map(b => b.scope).filter(b => b !== undefined);
        //     let optimized_scopes_filtered = optimized_scopes.filter((item, index) => optimized_scopes.indexOf(item) === index);
        //     // console.log(optimized_scopes_filtered);

        //     let line_numbers_opt = optimizedJSON.asm.filter(s => {
        //         if (!s.text) {
        //             return false;
        //         }
        //         let r = /^\!\d+ = .*line: \d.*$/gm
        //         return r.test(s.text);
        //     });

        //     //console.log(line_numbers_opt);
        //     //console.log("h2");

        //     let exclam_line_dict_opt = {};

        //     let line_numbers_opt_2 = line_numbers_opt.map(s => {
        //         let s2 = s.text;

        //         let r = /line: \d/gm
        //         let r2 = r.exec(s2)[0];

        //         const line = "line: ";
        //         const start = " = ";
                
        //         let exclam = s2.indexOf(start);
        //         // get part of string up to exclam
        //         let r3 = s2.substring(0, exclam);
        //         // get the number after line
        //         let line_num = parseInt(r2.substring(r2.indexOf(line)+line.length,r2.length));

        //         exclam_line_dict_opt[r3] = line_num;
        //     });

        //     let exclam_line_dict_opt_filtered = {};
        //     for (var key in exclam_line_dict_opt) {
        //         if (optimized_scopes_filtered.includes(key)) {
        //             exclam_line_dict_opt_filtered[key] = exclam_line_dict_opt[key];
        //         }
        //     }

        //     //console.log(exclam_line_dict_opt_filtered);

        //     // get the values from the dictionaries

        //     let initial_line_numbers = Object.values(exclam_line_dict_filtered);
        //     let optimized_line_numbers = Object.values(exclam_line_dict_opt_filtered);
        //     // remove duplicates
        //     initial_line_numbers = initial_line_numbers.filter((item, index) => initial_line_numbers.indexOf(item) === index);
        //     optimized_line_numbers = optimized_line_numbers.filter((item, index) => optimized_line_numbers.indexOf(item) === index);

        //     // find the values that are in the initial but not the optimized
        //     let initial_not_optimized = initial_line_numbers.filter(x => !optimized_line_numbers.includes(x));

        //     // find the values that are in both
        //     let initial_and_optimized = initial_line_numbers.filter(x => optimized_line_numbers.includes(x));

        //     console.log(initial_line_numbers);
        //     console.log(optimized_line_numbers);
        //     console.log("Retained lines: " + initial_and_optimized);
        //     console.log("Removed lines: " + initial_not_optimized);
        //     let activeEditor = vscode.window.activeTextEditor;
        //     if (activeEditor) {
        //         let decorations: vscode.DecorationOptions[] = [];
        //         // let emptyDecorationOptions: vscode.DecorationOptions[] = [];
        //         // let range = activeEditor.visibleRanges[0]; // Use the range of the visible area for the editor
        //         // activeEditor.setDecorations(vscode.window.createTextEditorDecorationType({}), emptyDecorationOptions);

        //         // loop through all line numbers in initial_not_optimized
        //         let lineCount = activeEditor.document.lineCount;
        //         let lineIndex = 0;
        //         let emptyDecorations: vscode.DecorationOptions[] = [];

        //         let emptyDecoration = vscode.window.createTextEditorDecorationType({});

        //         for (let line = 0; line < lineCount; line++){
        //             let startPos = new vscode.Position(line, 0);
        //             let endPos = new vscode.Position(line, activeEditor.document.lineAt(line).text.length);
                    
        //             if(line == (initial_not_optimized[lineIndex] as number)-1){
        //                 let decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'bad' };
        //                 // console.log((lineNumber as number));
        //                 decorations.push(decoration);
        //                 lineIndex += 1;
        //             }
        //             else{
        //                 let emptyOption: vscode.DecorationRenderOptions = {};
        //                 let decoration = { range: new vscode.Range(startPos, endPos),  emptyOption};
        //                 // console.log((lineNumber as number));
        //                 emptyDecorations.push(decoration);
        //             }
                    
        //         }
        //         console.log(decorations);
                
        //         activeEditor.setDecorations(squiggleDecoration, []);
        //         activeEditor.setDecorations(squiggleDecoration, decorations);
        //         setDecorated();
        //     }

        //     return processed;
        // });
        return allPromises;
    }
};