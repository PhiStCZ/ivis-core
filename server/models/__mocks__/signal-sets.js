function query(context, query) {
    const sigSetCid = query[0].sigSetCid;
    let results = [];

    if (sigSetCid === "1") results = [
        {id: "9", siga: 123, sigb: "ahoj", sigc: false},
        {id: "8", siga: -42.6, sigb: "jak", sigc: false},
        {id: "7", siga: 96, sigb: "se", sigc: true},
        {id: "6", siga: 693, sigb: "mas", sigc: true},
        {id: "5", siga: -69, sigb: "me", sigc: false},
        {id: "4", siga: 1, sigb: "z", sigc: true},
        {id: "3", siga: 3.14, sigb: "toho", sigc: false},
        {id: "2", siga: -2.7, sigb: "asi", sigc: false},
        {id: "1", siga: 666, sigb: "brzy", sigc: true},
        {id: "0", siga: 22, sigb: "klepne", sigc: true}
    ];
    else if (sigSetCid === "2") results = [
        {id: "9", siga: null, sigb: "ahoj", sigc: false},
        {id: "8", siga: -42.6, sigb: null, sigc: false},
        {id: "7", siga: 96, sigb: "se", sigc: null},
        {id: "6", siga: 693, sigb: "", sigc: true},
        {id: "5", siga: null, sigb: null, sigc: null},
        {id: "4", siga: 1, sigb: "z", sigc: true},
        {id: "3", siga: null, sigb: null, sigc: false},
        {id: "2", siga: -2.7, sigb: null, sigc: null},
        {id: "1", siga: null, sigb: "brzy", sigc: null},
        {id: "0", siga: 22, sigb: "klepne", sigc: true}
    ];

    return [{docs: results, total: 10}];
}

module.exports.query = query;
