import React from 'react';
import classnames from 'classnames';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-scss';

const GrammarMap = {
    js: Prism.languages.javascript,
    ts: Prism.languages.typescript,
    css: Prism.languages.css,
    bash: Prism.languages.bash,
    html: Prism.languages.html,
    jsx: Prism.languages.jsx,
    java: Prism.languages.java,
    sql: Prism.languages.sql,
    diff: Prism.languages.diff,
    scss: Prism.languages.scss
};

/**
 * This uses Prism to highlight a provided code snippet.
 */
const Code = ({ code, language = 'ts', className, ...props }) => {
    if (Array.isArray(code)) {
        code = code.join('\n');
    }

    return <pre className={classnames(`language-${language}`, className)} {...props}>
        {code && <code dangerouslySetInnerHTML={{ __html: Prism.highlight(code, GrammarMap[language], language) }} />}
    </pre>;
};

export default Code;