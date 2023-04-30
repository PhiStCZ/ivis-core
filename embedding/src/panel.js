'use strict';
const {VIRTUAL_WORKSPACE_ID, VIRTUAL_PANEL_ID} = require('../../shared/panels');

export function embedPanel(domElementId, ivisSandboxUrlBase, panelId, accessToken, optionsStr, callbacks) {
    const entityParams = {
        type: 'panel',
        id: panelId
    };

    const options = optionsStr ? JSON.parse(optionsStr) : null;

    embedEntity(domElementId, ivisSandboxUrlBase, entityParams, accessToken, options, callbacks);
}

/**
 * @param domElementId
 * @param ivisSandboxUrlBase
 * @param templateId
 * @param config With possible properties: {name, description, params}
 * @param accessToken
 * @param optionsStr
 * @param callbacks
 */
export function embedTemplate(domElementId, ivisSandboxUrlBase, templateId, config, accessToken, optionsStr, callbacks) {
    const entityParams = {
        type: 'template',
        id: templateId,
        config: config
    };

    const options = optionsStr ? JSON.parse(optionsStr) : null;
    embedEntity(domElementId, ivisSandboxUrlBase, entityParams, accessToken, options, callbacks);
}

/**
 * @param domElementId
 * @param ivisSandboxUrlBase
 * @param accessToken
 * @param path to the builtin template
 * @param params of the builtin template
 * @param optionsStr
 * @param callbacks
 */
export function embedBuiltinTemplate(domElementId, ivisSandboxUrlBase, accessToken, path, params, optionsStr, callbacks) {
    scheduleRefreshAccessToken(ivisSandboxUrlBase, accessToken);

    const contentProps = {
        params,
        panel: getVirtualPanel({ config: { params } }, { settings: { params: {} } }) // FIXME: this is just a temporary solution to make panelConfig work
    };
    const options = optionsStr ? JSON.parse(optionsStr) : null;
    embedContent(domElementId, ivisSandboxUrlBase, accessToken, path, contentProps, options, callbacks);
}

function restCall(method, url, data, callback) {
    const xhttp = new XMLHttpRequest();

    xhttp.onreadystatechange = () => {
        if (xhttp.readyState === 4 && xhttp.status === 200) {
            callback(xhttp.responseText ? JSON.parse(xhttp.responseText) : undefined);
        }
    };

    xhttp.open(method, url);
    xhttp.setRequestHeader("Content-type", "application/json");

    xhttp.send(data ? JSON.stringify(data) : null);
}

/**
 * @param urlBase sandbox url base
 * @param path url path
 * @param accessToken leave empty for anonymous sandbox url
 */
function getSandboxUrl(urlBase, path = '', accessToken = 'anonymous') {
    return urlBase + accessToken + '/' + path;
}

function scheduleRefreshAccessToken(urlBase, token) {
    setTimeout(() => restCall(
        'PUT',
        getSandboxUrl(urlBase, 'rest/embedded-entity-renew-restricted-access-token', token),
        {token},
        () => scheduleRefreshAccessToken(urlBase, token)
    ), 30 * 1000);
}

function getVirtualPanel(templateParams, templateEntity) {
    return {
        'id': VIRTUAL_PANEL_ID,
        'name': templateParams.config.name || '',
        'description': templateParams.config.description || '',
        'workspace': VIRTUAL_WORKSPACE_ID,
        'template': templateParams.id,
        'builtin_template': null,
        'params': templateParams.config.params || {},
        'namespace': templateEntity.namespace,
        'order': null,
        'templateParams': templateEntity.settings.params,
        'templateElevatedAccess': templateEntity.elevated_access,
        'permissions': [
            'edit',
            'view'
        ],
        'orderBefore': 'none'
    };
}

function embedEntity(domElementId, ivisSandboxUrlBase, entityParams, accessToken, options, callbacks) {
    const {type, id} = entityParams;

    scheduleRefreshAccessToken(ivisSandboxUrlBase, accessToken);

    restCall('GET', getSandboxUrl(`rest/${type}s/${id}`), null, entity => {
        const contentProps = {};
        if (type === 'template') {
            contentProps.panel = getVirtualPanel(entityParams, entity);
        } else {
            contentProps.panel = entity;
        }

        embedContent(domElementId, ivisSandboxUrlBase, accessToken, 'panel', contentProps, options, callbacks);
    });
}


function embedContent(domElementId, ivisSandboxUrlBase, accessToken, path, contentProps, options, callbacks) {

    const contentNode = document.createElement('iframe');
    let contentNodeIsLoaded = false;

    const sendMessage = (type, data) => {
        if (contentNodeIsLoaded) { // This is to avoid errors "common.js:45744 Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('http://localhost:8081') does not match the recipient window's origin ('http://localhost:3000')"
            contentNode.contentWindow.postMessage({type, data}, getSandboxUrl(ivisSandboxUrlBase, null, accessToken));
        }
    };

    const receiveMessage = evt => {
        const msg = evt.data;

        if (msg.type === 'initNeeded') {
            // It seems that sometime the message that the content node does not arrive. However if the content root notifies us, we just proceed
            contentNodeIsLoaded = true;
            sendMessage('init', {accessToken, contentProps});

        } else if (msg.type === 'rpcRequest') {
            const {method, params} = msg.data;

            let ret;

            if (method === 'navigateTo') {
                if (callbacks && callbacks.navigateTo) {
                    callbacks.navigateTo(params.path);
                }
            }

            sendMessage('rpcResponse', {msgId: msg.data.msgId, ret});

        } else if (msg.type === 'clientHeight') {
            contentNode.height = msg.data;
        }
    };

    window.addEventListener('message', receiveMessage, false);

    if (options && options.theme) {
        path += `?theme=${options.theme}`;
    }

    contentNode.src = getSandboxUrl(ivisSandboxUrlBase, path);
    contentNode.style.border = '0px none';
    contentNode.style.width = '100%';
    contentNode.style.overflow = 'hidden';
    contentNode.onload = () => contentNodeIsLoaded = true;

    document.getElementById(domElementId).appendChild(contentNode);
}
