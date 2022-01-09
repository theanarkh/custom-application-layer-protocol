const net = require('net');

const STATE = {
    parsing_total: 1,
    parsing_seq: 2,
    parsing_data: 3
};

class Packet {
    total;
    seq;
    data;
};

const EventEmitter = require('events');

class Parser extends EventEmitter {
    buffer = null;
    state = STATE.parsing_total;
    packet = new Packet();
    appendBuffer(buf) {
        this.buffer = this.buffer ? Buffer.concat([this.buffer, buf]) : buf;
    }
    updateBuffer(buf) {
        this.buffer = buf;
    }
    parse(buf) {
        this.appendBuffer(buf);
        while(1) {
            const len = Buffer.byteLength(this.buffer);
            switch(this.state) {
                case STATE.parsing_total:
                    if (len >= 4) {
                        this.packet = new Packet();
                        this.packet.total = this.buffer.readUInt32BE();
                        this.state = STATE.parsing_seq;
                        this.updateBuffer(this.buffer.slice(4));
                        break;
                    } else {
                        return;
                    }
                case STATE.parsing_seq:
                    if (len >= 4) {
                        this.packet.seq = this.buffer.readUInt32BE();
                        this.state = STATE.parsing_data;
                        this.updateBuffer(this.buffer.slice(4));
                        break;
                    } else {
                        return;
                    } 
                case STATE.parsing_data:
                    if (len >= this.packet.total) {
                        this.packet.data = JSON.parse(this.buffer.slice(0, this.packet.total).toString('utf-8'));
                        this.state = STATE.parsing_total;
                        this.updateBuffer(this.buffer.slice(this.packet.total));
                        this.emit('packet', this.packet);
                        this.packet = null;
                        break;
                    } else {
                        return;
                    }   
            }
        }
    }

    makePacket(seq, body) {
        const data = Buffer.from(body);
        const totalBuffer = Buffer.alloc(4);
        totalBuffer.writeUInt32BE(Buffer.byteLength(data));
        const seqBuffer = Buffer.alloc(4);
        seqBuffer.writeUInt32BE(seq);
        const buffer = Buffer.concat([totalBuffer, seqBuffer, data]);
        return buffer;
    }
}

net.createServer((socket) => {
    let parser = new Parser();
    parser.on('packet', (packet) => {
        console.log("receive request packet", JSON.stringify(packet, null, 4));
        const body = JSON.stringify({code: 0, msg: Date.now()});
        socket.write(parser.makePacket(packet.seq, body));
    });
    socket.on('data', (buf) => {
        parser.parse(buf);
    });
    socket.on('end', () => {
        parser = null;
    });
}).listen(10000);

setTimeout(() => {
    const socket = net.connect(10000);
    socket.on('connect', () => {
        let parser = new Parser();
        const body = JSON.stringify({hello: 'world'});
        socket.write(parser.makePacket(1, body));
        /*  
            delay send:
                socket.write(buffer.slice(0, 1));
                setTimeout(() => {
                    socket.write(buffer.slice(1, 2));
                    setTimeout(() => {
                        socket.write(buffer.slice(2));
                    }, 2000)
                }, 2000)
        */
        parser.on('packet', (packet) => {
            console.log("receive response packet", JSON.stringify(packet, null, 4));
            socket.end();
        });
        socket.on('data', (buf) => {
            parser.parse(buf);
        });
        socket.on('end', () => {
            parser = null;
        });
    });
}, 3000);
