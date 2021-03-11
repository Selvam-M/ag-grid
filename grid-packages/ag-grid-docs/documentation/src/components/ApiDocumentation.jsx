import React, { useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import classnames from 'classnames';
import { useJsonFileNodes } from './use-json-file-nodes';
import anchorIcon from 'images/anchor';
import Code from './Code';
import { inferType } from 'components/documentation-helpers';
import styles from './ApiDocumentation.module.scss';

/**
 * This generates tabulated API documentation based on information in JSON files. This way it is possible to show
 * information about different parts of an API in multiple places across the website while pulling the information
 * from one source of truth, so we only have to update one file when the documentation needs to change.
 */
export const ApiDocumentation = ({ pageName, source, sources, section, names = [], config = {} }) => {
    const nodes = useJsonFileNodes();

    if (source) {
        sources = [source];
    }

    if (!sources || sources.length < 1) {
        return null;
    }

    if (names && names.length) {
        names = JSON.parse(names);
    }

    const propertiesFromFiles = sources.map(s => getJsonFromFile(nodes, pageName, s));

    if (section == null) {
        const properties = mergeObjects(propertiesFromFiles);

        return Object.entries(properties)
            .map(([key, value]) => <Section key={key} title={key} properties={value} config={config} />);
    }

    const keys = section.split('.');
    const processed = keys.reduce((current, key) => current.map(x => x[key]), propertiesFromFiles);
    const properties = mergeObjects(processed);

    return <Section
        title={keys[keys.length - 1]}
        properties={properties}
        config={{ ...config, isSubset: true }}
        names={names} />;
};

const Section = ({ title, properties, config = {}, breadcrumbs = {}, names = [] }) => {
    const { meta } = properties;
    const displayName = (meta && meta.displayName) || title;

    breadcrumbs[title] = displayName;

    const breadcrumbKeys = Object.keys(breadcrumbs);
    const id = breadcrumbKeys.join('.');

    let header = null;

    if (!config.isSubset) {
        const headerLevel = breadcrumbKeys.length + 1;
        const HeaderTag = `h${headerLevel}`;

        // We use a plugin (gatsby-remark-autolink-headers) to insert links for all the headings in Markdown
        // We manually add the element here ourselves to match
        header = <>
            <HeaderTag id={`reference-${id}`} style={{ position: 'relative' }}>
                <a href={`#reference-${id}`} className="anchor before">{anchorIcon}</a>
                {displayName}
            </HeaderTag>
            <Breadcrumbs breadcrumbs={breadcrumbs} />
            {meta && meta.description && <p dangerouslySetInnerHTML={{ __html: generateCodeTags(meta.description) }}></p>}
            {meta && meta.page && <p>See <a href={meta.page.url}>{meta.page.name}</a> for more information.</p>}
            {config.showSnippets && names.length < 1 && <ObjectCodeSample breadcrumbs={breadcrumbs} properties={properties} />}
        </>;
    }

    if (Object.keys(properties).filter(p => p !== 'meta').length < 1) { return null; }

    const rows = [];
    const objectProperties = {};

    Object.entries(properties).forEach(([name, definition]) => {
        const { relevantTo } = definition;

        if (name === 'meta' ||
            (names.length > 0 && !names.includes(name) && !(relevantTo && relevantTo.includes(names[0])))) {
            return;
        }

        rows.push(<Property key={name} id={id} name={name} definition={definition} />);

        if (typeof definition !== 'string' && !definition.description) {
            // store object property to process later
            objectProperties[name] = definition;
        }
    });

    return <>
        {header}
        <table className={styles['reference']}>
            <tbody>
                {rows}
            </tbody>
        </table>
        {Object.entries(objectProperties).map(([name, definition]) => <Section
            key={name}
            title={name}
            properties={definition}
            config={{ ...config, isSubset: false }}
            breadcrumbs={{ ...breadcrumbs }}
        />)}
    </>;
};

const Property = ({ id, name, definition }) => {
    const [isExpanded, setExpanded] = useState(false);

    let description = '';
    let isObject = false;

    if (definition.description) {
        // process property object
        description = generateCodeTags(definition.description);

        const { more } = definition;

        if (more != null && more.url) {
            description += ` See <a href="${more.url}">${more.name}</a>.`;
        }
    } else if (typeof definition === 'string') {
        // process simple property string
        description = definition;
    } else {
        // this must be the parent of a child object
        if (definition.meta != null && definition.meta.description != null) {
            description = generateCodeTags(definition.meta.description);
        }

        isObject = true;
    }

    if (!!definition.isRequired) {
        name += `&nbsp;<span class="${styles['reference__required']}" title="Required">&ast;</span>`;
    }

    const type = definition.type || inferType(definition.default);
    const isFunction = !isObject && type != null && typeof type === 'object';

    const getTypeLink = type => {
        if (typeof type === 'string') {
            if (type.includes('|')) {
                // can't handle multiple types
                return null;
            } else if (type.endsWith('[]')) {
                type = 'Array';
            }
        }

        const specialTypes = {
            'HTMLElement': 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement'
        };

        return specialTypes[type] || `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/${type}`;
    };

    const link = isObject ? `#reference-${id}.${name}` : getTypeLink(type);

    return <tr>
        <td className={styles['reference__expander-cell']} onClick={() => setExpanded(!isExpanded)}>
            {isFunction && <div className={styles['reference__expander']}>
                <svg className={classnames({ 'fa-rotate-90': isExpanded })}><use href="#menu-item" /></svg>
            </div>}
        </td>
        <td onClick={() => setExpanded(!isExpanded)}>
            <code dangerouslySetInnerHTML={{ __html: name }} className={styles['reference__name']}></code>
            <div>
                {link && !isFunction ?
                    <a className={styles['reference__type']} href={link} target={link.startsWith('http') ? '_blank' : '_self'} rel="noreferrer">
                        {isObject ? getInterfaceName(name) : type}
                    </a> :
                    <span className={styles['reference__type']}>{isFunction ? 'Function' : type}</span>}
            </div>
        </td>
        <td>
            <div
                className={classnames(styles['reference__description'], { [styles['reference__description--expanded']]: isExpanded })}
                dangerouslySetInnerHTML={{ __html: description }}></div>
            {isObject && <div>See <a href={`#reference-${id}.${name}`}>{name}</a> for more details.</div>}
            {definition.default != null && <div>Default: <code>{formatJson(definition.default)}</code></div>}
            {definition.options != null && <div>Options: {definition.options.map((o, i) => <>{i > 0 ? ', ' : ''}<code key={o}>{formatJson(o)}</code></>)}</div>}
            {typeof definition.type === 'object' && <div className={isExpanded ? '' : 'd-none'}><FunctionCodeSample type={definition.type} /></div>}
        </td>
        {definition.relevantTo && <td style={{ whiteSpace: 'nowrap' }}>{definition.relevantTo.join(', ')}</td>}
    </tr>;
};

const Breadcrumbs = ({ breadcrumbs }) => {
    const breadcrumbsLength = Object.keys(breadcrumbs).length;

    if (breadcrumbsLength <= 1) { return null; }

    const links = [];
    let href = '';
    let index = 0;

    Object.entries(breadcrumbs).forEach(([key, text]) => {
        href += `${href.length > 0 ? '.' : 'reference-'}${key}`;

        if (index < breadcrumbsLength - 1) {
            links.push(<React.Fragment key={key}><a href={`#${href}`} title={text}>{key}</a> &gt; </React.Fragment>);
        } else {
            links.push(<React.Fragment key={key}>{key}</React.Fragment>);
        }

        index++;
    });

    return <div className={styles['breadcrumbs']}>{links}</div>;
};

const generateCodeTags = content => content.replace(/`(.*?)`/g, '<code>$1</code>');

const ObjectCodeSample = ({ breadcrumbs, properties }) => {
    const lines = [];
    let indentationLevel = 0;

    const getIndent = level => '  '.repeat(level);

    Object.keys(breadcrumbs).forEach(key => {
        const indent = getIndent(indentationLevel);

        if (indentationLevel > 0) {
            lines.push(`${indent}...`);
        }

        lines.push(`${indent}${key}: {`);

        indentationLevel++;
    });

    Object.entries(properties).forEach(([key, definition]) => {
        if (key === 'meta') { return; }

        let line = getIndent(indentationLevel) + key;

        // process property object
        if (!definition.isRequired) {
            line += '?';
        }

        line += ': ';

        if (definition.meta && definition.meta.type != null) {
            line += definition.meta.type;
        } else if (definition.type != null) {
            line += typeof definition.type === 'object' ? 'Function' : definition.type;
        } else if (definition.options != null) {
            line += definition.options.map(option => formatJson(option)).join(' | ');
        } else if (definition.default != null) {
            line += Array.isArray(definition.default) ? 'any[]' : typeof definition.default;
        } else if (definition.description != null) {
            line += 'any';
        } else {
            line += getInterfaceName(key);
        }

        line += ';';

        if (definition.default != null) {
            line += ` // default: ${formatJson(definition.default)}`;
        }

        lines.push(line);
    });

    while (indentationLevel > 0) {
        lines.push(`${getIndent(indentationLevel-- - 1)}}`);
    }

    return <Code code={lines.join('\n')} />;
};

const getInterfaceName = name => `I${name.substr(0, 1).toUpperCase()}${name.substr(1)}`;

const FunctionCodeSample = ({ type }) => {
    const args = type.parameters ? { params: type.parameters } : type.arguments;
    const { returnType } = type;
    const returnTypeIsObject = typeof returnType === 'object';
    const argumentDefinitions = [];

    Object.entries(args).forEach(([key, value]) => {
        const type = typeof value === 'object' ? getInterfaceName(key) : value;
        argumentDefinitions.push(`${key}: ${type}`);
    });

    const lines = [
        `function (${argumentDefinitions.join(',\n         ')}): ${returnTypeIsObject ? 'IReturn' : returnType};`,
    ];

    Object.keys(args)
        .filter(key => typeof args[key] === 'object')
        .forEach(key => lines.push('', ...getInterfaceLines(getInterfaceName(key), args[key])));

    if (returnTypeIsObject) {
        lines.push('', ...getInterfaceLines('IReturn', returnType));
    }

    return <Code code={lines.join('\n')} className={styles['reference__code-sample']} />;
};

const getInterfaceLines = (name, definition) => {
    const lines = [`interface ${name} {`];

    Object.entries(definition).forEach(([key, value]) => {
        lines.push(`  ${key}: ${value};`);
    });

    lines.push('}');

    return lines;
};

const getJsonFromFile = (nodes, pageName, source) => {
    const json = nodes.filter(n => n.relativePath === source || n.relativePath === `${pageName}/${source}`)[0];

    if (json) {
        return JSON.parse(json.internal.content);
    }

    throw new Error(`Could not find JSON for source ${source}`);
};

const mergeObjects = objects => {
    return objects.reduce((result, value) => Object.assign(result, value), {});
};

const formatJson = value => JSON.stringify(value, undefined, 2)
    .replace(/\[(.*?)\]/sg, (_, match) => `[${match.trim().replace(/,\s+/sg, ', ')}]`) // remove carriage returns from arrays
    .replace(/"/g, "'"); // use single quotes
