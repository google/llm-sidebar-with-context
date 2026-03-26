/// Native messaging host for LLM Sidebar Chrome extension.
///
/// Chrome native messaging protocol: messages are length-prefixed JSON.
///   - Read:  4-byte LE u32 length, then that many bytes of JSON
///   - Write: 4-byte LE u32 length, then that many bytes of JSON
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

#[derive(Deserialize)]
struct Request {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(flatten)]
    pub payload: serde_json::Value,
}

#[derive(Serialize)]
struct Response {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(flatten)]
    payload: serde_json::Value,
}

fn read_message() -> io::Result<Option<Request>> {
    let mut len_buf = [0u8; 4];
    match io::stdin().read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "message too large"));
    }
    let mut buf = vec![0u8; len];
    io::stdin().read_exact(&mut buf)?;
    let req: Request = serde_json::from_slice(&buf)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    Ok(Some(req))
}

fn write_message(resp: &Response) -> io::Result<()> {
    let json = serde_json::to_vec(resp)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let len = (json.len() as u32).to_le_bytes();
    let mut stdout = io::stdout().lock();
    stdout.write_all(&len)?;
    stdout.write_all(&json)?;
    stdout.flush()
}

fn handle(req: Request) -> Response {
    match req.msg_type.as_str() {
        "ping" => Response {
            msg_type: "pong".into(),
            payload: serde_json::json!({"version": env!("CARGO_PKG_VERSION")}),
        },
        _ => Response {
            msg_type: "error".into(),
            payload: serde_json::json!({"message": format!("unknown type: {}", req.msg_type)}),
        },
    }
}

fn main() {
    loop {
        match read_message() {
            Ok(Some(req)) => {
                let resp = handle(req);
                if let Err(e) = write_message(&resp) {
                    eprintln!("write error: {e}");
                    break;
                }
            }
            Ok(None) => break, // stdin closed
            Err(e) => {
                eprintln!("read error: {e}");
                break;
            }
        }
    }
}
