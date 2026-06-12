import { NextResponse } from 'next/server'

const TENANT_ID = process.env.DYNAMICS_TENANT_ID
const CLIENT_ID = process.env.DYNAMICS_CLIENT_ID
const CLIENT_SECRET = process.env.DYNAMICS_CLIENT_SECRET
const DYNAMICS_URL = process.env.DYNAMICS_URL

async function getAccessToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        scope: `https://${DYNAMICS_URL}/.default`,
      }),
    }
  )
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get token: ' + JSON.stringify(data))
  return data.access_token
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const entity = searchParams.get('entity') || 'leads'
  try {
    const token = await getAccessToken()
    const entityMap: Record<string, string> = {
      leads: 'leads?$select=fullname,emailaddress1,statuscode,estimatedvalue,createdon&$top=50&$orderby=createdon desc',
      contacts: 'contacts?$select=fullname,emailaddress1,telephone1,createdon&$top=50',
      opportunities: 'opportunities?$select=name,estimatedvalue,statecode,createdon&$top=50',
    }
    const query = entityMap[entity] || entityMap.leads
    const res = await fetch(`https://${DYNAMICS_URL}/api/data/v9.2/${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json({ success: true, data: data.value, count: data.value?.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
