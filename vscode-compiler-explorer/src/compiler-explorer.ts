import fetch from 'node-fetch';
import * as logger from './logger'
import { CompilerExplorerResponse, GodboltLabel } from './compiler-explorer-types';
import { getCompilerExplorerHost, getCompilerOptions, getCompilerCode, getCompilerIncludes } from './config';
import {BaseCompiler} from '../compiler-explorer/lib/base-compiler';

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
        console.log(options);
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
        let fetchPromise = fetch(`${apiHost}/api/compiler/${compiler}/compile`, {
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
        })
        .then((json: CompilerExplorerResponse) => { 
            console.log(json);
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
                return json.asm.map(a => a.text).join('\n'); 
            }
        }).then(initial_llvmir => {
            var new_options = this.getCompileAPIOptions("-passes=instcombine");
            // console.log("\n\n\n\n\n\n\n\n");
            // console.log(JSON.stringify({
            //     source: initial_llvmir,
            //         lang: "llvmir",
            //         options: new_options,
            //         allowStoreCodeDebug: true,
            //         compiler: "opt"
            // }));
            
            //opt and not opt1600
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
                    options: new_options,
                    allowStoreCodeDebug: true,
                    compiler: "opt"
                })
            })
        }).then(res => {
            return res.json();
        }).then(json2 => {
            console.log("--------------------------------------------------------------------")
            console.log(json2);
            return json2.asm.map(a => a.text).join('\n'); ;
        })
        .catch(function(error){
            console.log("we messed up", error);
        })

        return fetchPromise;
    }
};

