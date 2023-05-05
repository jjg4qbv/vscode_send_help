// Copyright (c) 2018, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import _ from 'underscore';

import type {IRResultLine} from '../types/asmresult/asmresult.interfaces.js';

import * as utils from './utils.js';

export class LlvmIrParser {
    private maxIrLines: number;
    private debugReference: RegExp;
    private metaNodeRe: RegExp;
    private metaNodeOptionsRe: RegExp;

    constructor(compilerProps) {
        this.maxIrLines = 5000;
        if (compilerProps) {
            this.maxIrLines = compilerProps('maxLinesOfAsm', this.maxIrLines);
        }

        this.debugReference = /!dbg (!\d+)/;
        this.metaNodeRe = /^(!\d+) = (?:distinct )?!DI([A-Za-z]+)\(([^)]+?)\)/;
        this.metaNodeOptionsRe = /(\w+): (!?\d+|\w+|""|"(?:[^"]|\\")*[^\\]")/gi;
    }

    getFileName(debugInfo, scope): string | null {
        const stdInLooking = /.*<stdin>|^-$|example\.[^/]+$|<source>/;

        if (!debugInfo[scope]) {
            // No such meta info.
            return null;
        }
        // MetaInfo is a file node
        if (debugInfo[scope].filename) {
            const filename = debugInfo[scope].filename;
            return stdInLooking.test(filename) ? null : filename;
        }
        // MetaInfo has a file reference.
        if (debugInfo[scope].file) {
            return this.getFileName(debugInfo, debugInfo[scope].file);
        }
        if (!debugInfo[scope].scope) {
            // No higher scope => can't find file.
            return null;
        }
        // "Bubbling" up.
        return this.getFileName(debugInfo, debugInfo[scope].scope);
    }

    getSourceLineNumber(debugInfo, scope) {
        if (!debugInfo[scope]) {
            return null;
        }
        if (debugInfo[scope].line) {
            // console.log(Number(debugInfo[scope].line));
            return Number(debugInfo[scope].line);
        }
        if (debugInfo[scope].scope) {
            // console.log(this.getSourceLineNumber(debugInfo, debugInfo[scope].scope));
            return this.getSourceLineNumber(debugInfo, debugInfo[scope].scope);
        }

        return null;
    }

    getSourceColumn(debugInfo, scope): number | undefined {
        if (!debugInfo[scope]) {
            return;
        }
        if (debugInfo[scope].column) {
            return Number(debugInfo[scope].column);
        }
        if (debugInfo[scope].scope) {
            return this.getSourceColumn(debugInfo, debugInfo[scope].scope);
        }
    }

    parseMetaNode(line) {
        // Metadata Nodes
        // See: https://llvm.org/docs/LangRef.html#metadata
        const match = line.match(this.metaNodeRe);
        if (!match) {
            return null;
        }
        const metaNode = {
            metaId: match[1],
            metaType: match[2],
        };

        let keyValuePair;
        while ((keyValuePair = this.metaNodeOptionsRe.exec(match[3]))) {
            const key = keyValuePair[1];
            metaNode[key] = keyValuePair[2];
            // Remove "" from string
            if (metaNode[key][0] === '"') {
                metaNode[key] = metaNode[key].substr(1, metaNode[key].length - 2);
            }
        }

        return metaNode;
    }

    processIr(ir, filters) {
        // console.log(filters);
        const result: IRResultLine[] = [];
        const irLines = utils.splitLines(ir);
        const debugInfo = {};
        let prevLineEmpty = false;

        // Filters
        const commentOnly = /^\s*(;.*)$/;
        const debugLine = /@llvm\.dbg\.declare/;

        for (const line of irLines) {
            if (line.trim().length === 0) {
                // Avoid multiple successive empty lines.
                if (!prevLineEmpty) {
                    result.push({text: ''});
                }
                prevLineEmpty = true;
                continue;
            }

            if (filters.commentOnly && commentOnly.test(line)) {
                continue;
            }
            // if (filters.libraryCode && line.match(debugLine)) {
            //     continue;
            // }
            
            // Non-Meta IR line. Metadata is attached to it using "!dbg !123"
            const match = line.match(this.debugReference);
            if (match) {
                var string_matched = filters.trim ? utils.squashHorizontalWhitespace(line) : line;
                var string_split = string_matched.split(this.debugReference);
                // console.log(string_split);

                var string_without_debug = "";

                for(var s in string_split){
                    // console.log("string at ind:");
                    // console.log(string_split[s]);
                    var last_two_characters = string_split[s].substring(string_split[s].length - 2, string_split[s].length);
                    var contains_metadata_info = string_split[s].includes("!");

                    if(contains_metadata_info){
                        //stuff like "!17" belonging to the debug metadata info
                        continue;
                    }
                    else if(last_two_characters == ", "){
                        //formatting for leftover commands from parsing
                        string_without_debug = string_without_debug.concat(string_split[s].substring(0, string_split[s].length-2));
                    }
                    else{
                        //rest of string
                        string_without_debug = string_without_debug.concat(string_split[s]);
                    }
                }
                // console.log("string without debug info: ");
                // console.log(string_without_debug);
                // if(string_split.length > 1){
                //     string_split[0] = string_split[0].substring(0, string_split[0].length - 2);
                // }
                result.push({
                    text: filters.trim ? utils.squashHorizontalWhitespace(line) : line,
                    scope: match[1],
                });
                prevLineEmpty = false;
                // console.log("matched nonmeta?");
                // console.log(result);
                continue;
            }

            const metaNode = this.parseMetaNode(line);
            if (metaNode) {
                debugInfo[metaNode.metaId] = metaNode;
                result.push({
                    text: line
                });
            }
            else{
                result.push({text: filters.trim ? utils.squashHorizontalWhitespace(line) : line});
            }

            // if (filters.directives && this.isLineLlvmDirective(line)) {
            //     continue;
            // }
            
            prevLineEmpty = false;
        }

        if (result.length >= this.maxIrLines) {
            result.length = this.maxIrLines + 1;
            result[this.maxIrLines] = {text: '[truncated; too many lines]'};
        }
        

        for (const line of result) {
            if (!line.scope) continue;
            line.source = {
                file: this.getFileName(debugInfo, line.scope),
                line: this.getSourceLineNumber(debugInfo, line.scope),
                column: this.getSourceColumn(debugInfo, line.scope),
            };
        }

        return {
            asm: result,
            labelDefinitions: {},
            languageId: 'llvm-ir',
        };
    }

    process(ir, filters) {
        if (_.isString(ir)) {
            return this.processIr(ir, filters);
        }
        return {
            asm: [],
            labelDefinitions: {},
        };
    }

    isLineLlvmDirective(line) {
        return !!(
            /^!\d+ = (distinct )?!(DI|{)/.test(line) ||
            line.startsWith('!llvm') ||
            line.startsWith('source_filename = ') ||
            line.startsWith('target datalayout = ') ||
            line.startsWith('target triple = ')
        );
    }

    isLlvmIr(code) {
        return code.includes('@llvm') && code.includes('!DI') && code.includes('!dbg');
    }
}
