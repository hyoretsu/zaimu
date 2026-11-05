package main
import ("net/http";"os";"time";"io")
func main(){if len(os.Args)!=2{os.Exit(2)};c:=&http.Client{Timeout:4*time.Second};r,e:=c.Get(os.Args[1]);if e!=nil{os.Exit(1)};defer r.Body.Close();io.Copy(io.Discard,io.LimitReader(r.Body,4096));if r.StatusCode<200||r.StatusCode>=300{os.Exit(1)}}
