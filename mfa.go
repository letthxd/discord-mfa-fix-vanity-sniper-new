package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

const (
	mfatoken = ""
	password = ""
)

type MFAResponse struct {
	Token string `json:"token"`
}
type VanityResponse struct {
	MFA struct {
		Ticket string `json:"ticket"`
	} `json:"mfa"`
}

func setHeaders(req *http.Request) {
	req.Header.Set("Authorization", mfatoken)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
	req.Header.Set("X-Super-Properties", "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiaGFzX2NsaWVudF9tb2RzIjpmYWxzZSwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEzMy4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6ImNhbmFyeSIsImNsaWVudF9idWlsZF9udW1iZXIiOjM2ODc3MCwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=")
	req.Header.Set("X-Discord-Timezone", "Europe/Berlin")
	req.Header.Set("X-Discord-Locale", "en-US")
	req.Header.Set("X-Debug-Options", "bugReporterEnabled")
	req.Header.Set("Content-Type", "application/json")
}
func getMFAToken(client *http.Client) (string, error) {
	vanityReq, err := http.NewRequest("PATCH",
		"https://canary.discord.com/api/v7/guilds/0/vanity-url",
		bytes.NewBuffer([]byte("{\"code\":\"xupp\"}")))
	if err != nil {
		return "", err
	}
	setHeaders(vanityReq)
	vanityResp, err := client.Do(vanityReq)
	if err != nil {
		return "", err
	}
	defer vanityResp.Body.Close()
	vanityBytes, err := io.ReadAll(vanityResp.Body)
	if err != nil {
		return "", err
	}
	var vanityResponse VanityResponse
	if err := json.Unmarshal(vanityBytes, &vanityResponse); err != nil {
		return "", err
	}
	mfaPayload := map[string]string{
		"ticket":   vanityResponse.MFA.Ticket,
		"mfa_type": "password",
		"data":     password,
	}
	mfaData, err := json.Marshal(mfaPayload)
	if err != nil {
		return "", err
	}
	mfaReq, err := http.NewRequest("POST",
		"https://canary.discord.com/api/v9/mfa/finish",
		bytes.NewBuffer(mfaData))
	if err != nil {
		return "", err
	}
	setHeaders(mfaReq)
	mfaResp, err := client.Do(mfaReq)
	if err != nil {
		return "", err
	}
	defer mfaResp.Body.Close()

	mfaBytes, err := io.ReadAll(mfaResp.Body)
	if err != nil {
		return "", err
	}

	var mfaResponse MFAResponse
	if err := json.Unmarshal(mfaBytes, &mfaResponse); err != nil {
		return "", err
	}

	return mfaResponse.Token, nil
}
func saveMFAToken(token string) error {
	return os.WriteFile("mfa_token.txt", []byte(token), 0644)
}
func main() {
	log.SetFlags(0)
	tlsConfig := &tls.Config{
		MinVersion:               tls.VersionTLS12,
		MaxVersion:               tls.VersionTLS13,
		PreferServerCipherSuites: true,
		InsecureSkipVerify:       true,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		},
	}
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig:     tlsConfig,
			MaxIdleConns:        10,
			IdleConnTimeout:     30 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		},
		Timeout: 10 * time.Second,
	}
	for {
		mfaToken, err := getMFAToken(client)
		if err != nil {
			log.Println("Error getting MFA token:", err)
		} else {
			if err := saveMFAToken(mfaToken); err != nil {
				log.Println("Error saving MFA token:", err)
			} else {
				log.Println("mfa alindi")
			}
		}

		time.Sleep(5 * time.Minute)
	}
}
