import type { Metadata } from 'next';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  ArrowLeft,
  CalendarCheck,
  Mail,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/format';
import { toPublicSettingsDTO } from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { PublicShell } from '@/components/PublicShell';
import { normalizeInstagramHandle } from '@/components/booking/bookingHelpers';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);

  return {
    title: 'Aviso de Privacidad',
    description: `Aviso de Privacidad Integral de ${settings.name} conforme a la LFPDPPP en Puebla, México. Consulta finalidades, conservación y ejercicio de derechos ARCO.`,
    alternates: { canonical: '/aviso-de-privacidad' },
  };
}

export default function AvisoDePrivacidadPage() {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);

  const responsibleName =
    settings.depositBeneficiary ||
    settings.depositAccountHolder ||
    'Karla Patricia Carrillo Rodríguez';
  const cityLabel = settings.city || 'Puebla, México';
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const policyVersion = settings.privacyPolicyVersion || '2026-11';
  const whatsappArcoUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, deseo ejercer mis derechos ARCO o solicitar copia de mis datos personales.`,
  );
  const mailtoArco = `mailto:${encodeURIComponent(settings.contactEmail)}?subject=${encodeURIComponent(`Solicitud Derechos ARCO — ${settings.name}`)}`;

  return (
    <PublicShell>
      <Section variant="transparent" paddingBlock={8} paddingInline={4}>
        <VStack
          gap={6}
          maxWidth={840}
          width="100%"
          style={{ marginInline: 'auto' }}
        >
          <VStack gap={3} align="start">
            <HStack gap={2} wrap="wrap" align="center">
              <Token
                label={`Versión ${policyVersion}`}
                size="sm"
                icon={<ShieldCheck size={14} aria-hidden="true" />}
              />
              <Token label="LFPDPPP · México" size="sm" />
              <Token label={cityLabel} size="sm" />
            </HStack>
            <Heading level={1} type="display-2" textWrap="balance">
              Aviso de Privacidad Integral
            </Heading>
            <Text type="large" color="secondary" textWrap="pretty">
              En {settings.name} protegemos tus datos personales con apego a la Ley
              Federal de Protección de Datos Personales en Posesión de los
              Particulares (LFPDPPP) y su Reglamento. Aquí te explicamos con claridad
              qué información recabamos, para qué la usamos y cómo ejercer tus
              derechos ARCO.
            </Text>
          </VStack>

          <Divider />

          <VStack gap={2}>
            <Heading level={2}>1. Identidad y domicilio del responsable</Heading>
            <Text as="p" type="body" textWrap="pretty">
              <strong>{responsibleName}</strong>, responsable comercial de{' '}
              <strong>{settings.name}</strong> ({instagramHandle}), con domicilio en{' '}
              {settings.address}, es responsable del uso, resguardo y protección de
              tus datos personales. Para cualquier asunto relacionado con este aviso
              puedes escribir a {settings.contactEmail} o por WhatsApp al{' '}
              {settings.whatsappNumber}.
            </Text>
          </VStack>

          <VStack gap={2}>
            <Heading level={2}>2. Datos personales que recabamos</Heading>
            <Text as="p" type="body" textWrap="pretty">
              Aplicamos el principio de minimización de datos: solo solicitamos la
              información indispensable para agendar y brindarte un servicio seguro.
            </Text>
            <List listStyle="disc" density="compact">
              <ListItem
                label="Datos de identificación y contacto obligatorios"
                description={
                  <Text type="supporting" color="secondary">
                    Nombre completo y número de teléfono o WhatsApp para confirmar,
                    recordar y gestionar tu cita.
                  </Text>
                }
              />
              <ListItem
                label="Datos opcionales proporcionados voluntariamente"
                description={
                  <Text type="supporting" color="secondary">
                    Correo electrónico (envío de confirmación e invitación de
                    calendario .ics), cuenta de @instagram (coordinación de diseño o
                    comprobante por DM) y fecha de cumpleaños (cortesías de temporada
                    si eliges compartirla).
                  </Text>
                }
              />
              <ListItem
                label="Datos técnicos del servicio y comprobación de anticipo"
                description={
                  <Text type="supporting" color="secondary">
                    Notas técnicas sobre diseño, largo o sensibilidades/alergias que
                    decidas informarnos, fotografías de inspiración que subas y
                    comprobantes de transferencia bancaria de anticipo.
                  </Text>
                }
              />
            </List>
            <Text as="p" type="supporting" color="secondary">
              No recabamos datos biométricos ni almacenamos contraseñas o números de
              tarjetas bancarias en nuestros formularios públicos.
            </Text>
          </VStack>

          <VStack gap={3}>
            <Heading level={2}>3. Finalidades del tratamiento</Heading>

            <VStack gap={1.5}>
              <Heading level={3}>
                Finalidades primarias (necesarias para el servicio)
              </Heading>
              <List listStyle="disc" density="compact">
                <ListItem label="Agendar, confirmar, reagendar y cancelar citas en tiempo real." />
                <ListItem label="Enviar confirmaciones, enlace personal de gestión y recordatorios operativos por WhatsApp o correo." />
                <ListItem label="Validar anticipos, aplicar cupones o tarjetas de regalo y emitir comprobantes del servicio." />
                <ListItem label="Atender notas técnicas o alergias declaradas por la clienta y prevenir reservas duplicadas o suplantaciones." />
              </List>
            </VStack>

            <VStack gap={1.5}>
              <Heading level={3}>
                Finalidades secundarias (opcionales y con consentimiento expreso)
              </Heading>
              <List listStyle="disc" density="compact">
                <ListItem label="Enviar promociones, aperturas de agenda de temporada y recordatorios opcionales de retoque." />
                <ListItem label="Otorgar sellos de lealtad y cortesías de cumpleaños." />
              </List>
              <Text as="p" type="supporting" color="secondary">
                La negativa para finalidades secundarias nunca será motivo para
                negarte citas ni servicios en {settings.name}. Puedes otorgar o
                revocar este permiso en cualquier momento.
              </Text>
            </VStack>
          </VStack>

          <VStack gap={2}>
            <Heading level={2}>4. Transferencias limitadas de datos</Heading>
            <Text as="p" type="body" textWrap="pretty">
              {settings.name} no vende, renta ni comercializa tus datos personales con
              terceros. Únicamente realizamos remisiones operativas estrictamente
              necesarias con proveedores tecnológicos de infraestructura en la nube,
              correo transaccional y mensajería oficial de WhatsApp que permiten
              confirmar tu cita, bajo deberes de confidencialidad, así como los casos
              previstos en el artículo 37 de la LFPDPPP ante requerimiento legal de
              autoridad competente.
            </Text>
          </VStack>

          <Card padding={5} variant="muted" width="100%">
            <VStack gap={3} width="100%">
              <Heading level={2}>
                5. Derechos ARCO, descarga de datos y revocación
              </Heading>
              <Text as="p" type="body" textWrap="pretty">
                En todo momento tienes derecho a <strong>Acceder</strong> a los datos
                personales que tenemos sobre ti (incluyendo solicitar una copia
                descargable de tu perfil, citas, sellos de lealtad y registros de
                consentimiento), <strong>Rectificarlos</strong> si son inexactos,{' '}
                <strong>Cancelarlos</strong> cuando consideres que ya no son
                necesarios, <strong>Oponerte</strong> a su uso para fines específicos
                o <strong>Revocar</strong> tu consentimiento para comunicaciones
                promocionales.
              </Text>
              <Text as="p" type="supporting" color="secondary" textWrap="pretty">
                Para ejercer tus derechos ARCO envía una solicitud indicando tu nombre
                completo, teléfono registrado en tu cita, el derecho que deseas
                ejercer y el medio para recibir respuesta. Conforme al artículo 32 de
                la LFPDPPP responderemos en un plazo máximo de 20 días hábiles y, de
                resultar procedente, haremos efectiva la solicitud dentro de los 15
                días hábiles siguientes.
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  label={`Escribir a ${settings.contactEmail}`}
                  variant="primary"
                  size="md"
                  icon={<Mail size={16} aria-hidden="true" />}
                  href={mailtoArco}
                />
                <Button
                  label="Solicitar por WhatsApp"
                  variant="secondary"
                  size="md"
                  icon={<MessageCircle size={16} aria-hidden="true" />}
                  href={whatsappArcoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          </Card>

          <VStack gap={2}>
            <Heading level={2}>6. Conservación y medidas de seguridad</Heading>
            <Text as="p" type="body" textWrap="pretty">
              Resguardamos tus datos mediante controles de acceso restringido al
              personal autorizado del estudio y sesiones firmadas. Conservamos tu
              información únicamente durante el tiempo necesario para atender tus
              citas, mantener el historial técnico de servicio mientras seas clienta
              activa y cumplir obligaciones administrativas o fiscales aplicables. Las
              imágenes de inspiración y comprobantes de pago pueden eliminarse
              directamente a solicitud tuya mediante los canales de contacto
              anteriores.
            </Text>
          </VStack>

          <VStack gap={2}>
            <Heading level={2}>7. Cambios y versión vigente del aviso</Heading>
            <Text as="p" type="body" textWrap="pretty">
              Cualquier actualización a este Aviso de Privacidad se publicará de
              manera transparente en esta misma dirección (/aviso-de-privacidad) con
              su identificador de versión correspondiente. Versión vigente:{' '}
              <strong>{policyVersion}</strong>.
            </Text>
          </VStack>

          <Divider />

          <HStack gap={3} wrap="wrap">
            <Button
              label="Volver a reservar cita"
              variant="primary"
              size="md"
              icon={<CalendarCheck size={16} aria-hidden="true" />}
              href="/reservar"
            />
            <Button
              label="Enlaces rápidos"
              variant="secondary"
              size="md"
              href="/links"
            />
            <Button
              label="Ir al inicio"
              variant="ghost"
              size="md"
              icon={<ArrowLeft size={16} aria-hidden="true" />}
              href="/"
            />
          </HStack>
        </VStack>
      </Section>
    </PublicShell>
  );
}
