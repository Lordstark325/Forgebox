using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace ForgeNetClient {
  public sealed class MainForm : Form {
    readonly TextBox server = Box("https://network.example.com");
    readonly TextBox token = Box("");
    readonly TextBox device = Box(Environment.MachineName);
    readonly TextBox endpoint = Box("");
    readonly TextBox log = new TextBox { Multiline=true, ReadOnly=true, ScrollBars=ScrollBars.Vertical, Dock=DockStyle.Fill };
    readonly Button enroll = new Button { Text="Enroll this PC", AutoSize=true };
    readonly Button sync = new Button { Text="Sync and install tunnel", AutoSize=true };
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ForgeNet");

    static TextBox Box(string value) { return new TextBox { Text=value, Width=430 }; }
    public MainForm() {
      Text="ForgeNet"; Width=650; Height=570; StartPosition=FormStartPosition.CenterScreen;
      var fields = new TableLayoutPanel { Dock=DockStyle.Top, AutoSize=true, ColumnCount=2, Padding=new Padding(18) };
      fields.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,140)); fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
      Add(fields,"Server (HTTPS)",server); Add(fields,"Enrollment token",token); token.UseSystemPasswordChar=true;
      Add(fields,"Device name",device); Add(fields,"Public endpoint",endpoint);
      var buttons = new FlowLayoutPanel { Dock=DockStyle.Top, AutoSize=true, Padding=new Padding(18,0,18,10) };
      buttons.Controls.Add(enroll); buttons.Controls.Add(sync);
      var note = new Label { Dock=DockStyle.Top, AutoSize=true, Padding=new Padding(18,4,18,12), Text="Requires the official WireGuard for Windows client. Remote servers must use HTTPS." };
      var output = new Panel { Dock=DockStyle.Fill, Padding=new Padding(18) }; output.Controls.Add(log);
      Controls.Add(output); Controls.Add(note); Controls.Add(buttons); Controls.Add(fields);
      enroll.Click += async (s,e) => await Enroll(); sync.Click += async (s,e) => await Sync();
      Shown += (s,e) => Write("Ready. Create an enrollment token on your ForgeNet server, then enroll this PC.");
    }
    static void Add(TableLayoutPanel p,string label,Control control) { int r=p.RowCount++; p.RowStyles.Add(new RowStyle(SizeType.AutoSize)); p.Controls.Add(new Label {Text=label,AutoSize=true,Padding=new Padding(0,7,0,0)},0,r); p.Controls.Add(control,1,r); }
    void Write(string value) { log.AppendText("["+DateTime.Now.ToString("HH:mm:ss")+"] "+value+Environment.NewLine); }
    string Wg() {
      foreach(var p in new[]{"wg.exe", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WireGuard","wg.exe")}) {
        try { var psi=new ProcessStartInfo(p,"--version") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true}; using(var x=Process.Start(psi)){x.WaitForExit(); if(x.ExitCode==0)return p;} } catch {}
      }
      throw new Exception("WireGuard was not found. Install it from wireguard.com/install first.");
    }
    string Run(string exe,string args,string input=null) { var p=new ProcessStartInfo(exe,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,RedirectStandardInput=input!=null}; using(var x=Process.Start(p)){if(input!=null){x.StandardInput.Write(input);x.StandardInput.Close();} string o=x.StandardOutput.ReadToEnd().Trim(), e=x.StandardError.ReadToEnd().Trim();x.WaitForExit();if(x.ExitCode!=0)throw new Exception(e.Length>0?e:"Command failed.");return o;} }
    Uri BaseUri() { Uri u; if(!Uri.TryCreate(server.Text.Trim().TrimEnd('/'),UriKind.Absolute,out u))throw new Exception("Enter a valid server URL."); if(u.Scheme!="https" && !u.IsLoopback)throw new Exception("Remote ForgeNet servers must use HTTPS."); return u; }
    async Task<Dictionary<string,object>> Post(string path,object value,Dictionary<string,string> headers=null) { using(var c=new HttpClient()){if(headers!=null)foreach(var h in headers)c.DefaultRequestHeaders.TryAddWithoutValidation(h.Key,h.Value);var content=new StringContent(json.Serialize(value),Encoding.UTF8,"application/json");var r=await c.PostAsync(new Uri(BaseUri(),path),content);var text=await r.Content.ReadAsStringAsync();var obj=json.Deserialize<Dictionary<string,object>>(text);if(!r.IsSuccessStatusCode)throw new Exception(obj.ContainsKey("error")?Convert.ToString(obj["error"]):"Server request failed.");return obj;} }
    async Task Enroll() { Toggle(false); try { Directory.CreateDirectory(root); string wg=Wg(); string priv=Run(wg,"genkey"), pub=Run(wg,"pubkey",priv); var result=await Post("/v1/devices/enroll",new {token=token.Text.Trim(),name=device.Text.Trim(),publicKey=pub,endpoint=String.IsNullOrWhiteSpace(endpoint.Text)?null:endpoint.Text.Trim()});var d=(Dictionary<string,object>)result["device"];var saved=new Dictionary<string,object>{{"server",BaseUri().ToString().TrimEnd('/')},{"deviceId",Convert.ToString(d["id"])},{"secret",Convert.ToString(result["secret"])},{"privateKey",priv},{"ip",Convert.ToString(d["ip"])},{"name",Convert.ToString(d["name"])} };File.WriteAllText(Path.Combine(root,"credentials.json"),json.Serialize(saved),Encoding.UTF8);token.Clear();Write("Enrolled as "+saved["ip"]+". Credentials saved securely for this machine."); } catch(Exception ex){Write("ERROR: "+ex.Message);} finally {Toggle(true);} }
    async Task Sync() { Toggle(false); try { string file=Path.Combine(root,"credentials.json");if(!File.Exists(file))throw new Exception("Enroll this PC first.");var c=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));server.Text=Convert.ToString(c["server"]);var h=new Dictionary<string,string>{{"Authorization","Bearer "+c["secret"]},{"X-ForgeNet-Device",Convert.ToString(c["deviceId"])} };var n=await Post("/v1/devices/heartbeat",new {endpoint=String.IsNullOrWhiteSpace(endpoint.Text)?null:endpoint.Text.Trim()},h);var sb=new StringBuilder();sb.AppendLine("[Interface]");sb.AppendLine("PrivateKey = "+c["privateKey"]);var current=(Dictionary<string,object>)n["device"];sb.AppendLine("Address = "+current["ip"]+"/32");sb.AppendLine("ListenPort = 51820");var peers=(object[])n["peers"];foreach(object value in peers){var p=(Dictionary<string,object>)value;if(p["endpoint"]==null)continue;sb.AppendLine();sb.AppendLine("[Peer]");sb.AppendLine("PublicKey = "+p["publicKey"]);sb.AppendLine("AllowedIPs = "+p["ip"]+"/32");sb.AppendLine("Endpoint = "+p["endpoint"]);sb.AppendLine("PersistentKeepalive = 25");}string conf=Path.Combine(root,"ForgeNet.conf");File.WriteAllText(conf,sb.ToString(),Encoding.ASCII);string wireguard=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WireGuard","wireguard.exe");if(!File.Exists(wireguard))throw new Exception("wireguard.exe was not found.");try{Run(wireguard,"/uninstalltunnelservice ForgeNet");}catch{}Run(wireguard,"/installtunnelservice \""+conf+"\"");Write("Tunnel synchronized and installed with "+peers.Length+" discovered peer(s).");} catch(Exception ex){Write("ERROR: "+ex.Message);} finally {Toggle(true);} }
    void Toggle(bool on){enroll.Enabled=sync.Enabled=on;}
    [STAThread] public static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new MainForm());}
  }
}
